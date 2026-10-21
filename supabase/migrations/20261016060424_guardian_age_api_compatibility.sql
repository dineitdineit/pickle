-- Keep the old 18+ payload for installed clients; updated clients explicitly
-- use v2. Never report a guardian-pending account as adult/eligible to old clients.
create function public.get_account_age_status_v2() returns jsonb language sql stable security invoker set search_path='' as $$ select operations_helpers.age_status(); $$;
create function public.confirm_account_age_v2(p_birth_date date) returns jsonb language sql security invoker set search_path='' as $$ select operations_helpers.confirm_age(p_birth_date); $$;
revoke all on function public.get_account_age_status_v2(),public.confirm_account_age_v2(date) from public,anon;
grant execute on function public.get_account_age_status_v2(),public.confirm_account_age_v2(date) to authenticated;
create function guardian_helpers.legacy_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 return jsonb_build_object('user_id',auth.uid(),'eligible',operations_helpers.age_eligible() and exists(select 1 from public.account_age_confirmations where user_id=auth.uid() and minimum_age=18 and not requires_guardian),'minimum_age',18,'rule_version','18-plus-v1');
end; $$;
revoke all on function guardian_helpers.legacy_status() from public,anon;
grant execute on function guardian_helpers.legacy_status() to authenticated;
create or replace function public.get_account_age_status() returns jsonb language sql stable security invoker set search_path='' as $$ select guardian_helpers.legacy_status(); $$;
create function guardian_helpers.legacy_confirm(p_birth_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'UTC')::date;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_birth_date is null or p_birth_date>today or p_birth_date<(today-interval '120 years')::date then raise exception 'Enter a valid birth date' using errcode='22023'; end if;
 if p_birth_date>(today-interval '18 years')::date then raise exception 'Update Pickle to use the 13+ account flow' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('age:'||auth.uid()::text,0));
 if exists(select 1 from operations_helpers.account_deletions where user_id=auth.uid()) then raise exception 'Account deleting' using errcode='42501'; end if;
 -- Never convert a guardian-dependent record by declaring an older birthday.
 insert into public.account_age_confirmations(user_id,rule_version,minimum_age) values(auth.uid(),'18-plus-v1',18)
 on conflict(user_id) do update set rule_version='18-plus-v1',minimum_age=18 where not account_age_confirmations.requires_guardian;
 return guardian_helpers.legacy_status();
end; $$;
revoke all on function guardian_helpers.legacy_confirm(date) from public,anon;
grant execute on function guardian_helpers.legacy_confirm(date) to authenticated;
create or replace function public.confirm_account_age(p_birth_date date) returns jsonb language sql security invoker set search_path='' as $$ select guardian_helpers.legacy_confirm(p_birth_date); $$;

-- Newly created profiles stay private until their age category is known.
-- Preserve pre-rollout profiles that have not yet completed the older check.
create table guardian_helpers.rollout (singleton boolean primary key default true check(singleton),started_at timestamptz not null default now());
alter table guardian_helpers.rollout enable row level security;
revoke all on guardian_helpers.rollout from public,anon,authenticated;
insert into guardian_helpers.rollout(singleton) values(true);
create or replace function guardian_helpers.public_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.account_age_confirmations a where a.user_id=p_user and
 (not a.requires_guardian or exists(select 1 from guardian_helpers.requests g join public.content_policy_versions v on v.version=g.policy_version and v.active where g.user_id=a.user_id and g.status='approved')))
 or (not exists(select 1 from public.account_age_confirmations where user_id=p_user) and exists(select 1 from auth.users u cross join guardian_helpers.rollout r where u.id=p_user and u.created_at<r.started_at));
$$;
notify pgrst,'reload schema';
