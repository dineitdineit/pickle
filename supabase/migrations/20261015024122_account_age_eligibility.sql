create table public.account_age_confirmations (
 user_id uuid primary key references auth.users(id) on delete cascade,
 rule_version text not null check(rule_version='18-plus-v1'),
 minimum_age integer not null check(minimum_age=18),
 confirmed_at timestamptz not null default now()
);
alter table public.account_age_confirmations enable row level security;
revoke all on public.account_age_confirmations from public,anon,authenticated;
grant select on public.account_age_confirmations to authenticated;
create policy own_age_confirmation on public.account_age_confirmations for select to authenticated
using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

create function operations_helpers.age_eligible() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from public.account_age_confirmations where user_id=auth.uid() and rule_version='18-plus-v1' and minimum_age=18);
$$;
revoke all on function operations_helpers.age_eligible() from public,anon,authenticated;
grant execute on function operations_helpers.age_eligible() to authenticated;
create function operations_helpers.age_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 return jsonb_build_object('user_id',auth.uid(),'eligible',operations_helpers.age_eligible(),'minimum_age',18,'rule_version','18-plus-v1');
end; $$;
revoke all on function operations_helpers.age_status() from public,anon,authenticated;
grant execute on function operations_helpers.age_status() to authenticated;
create function public.get_account_age_status() returns jsonb
language sql stable security invoker set search_path='' as $$ select operations_helpers.age_status(); $$;
revoke all on function public.get_account_age_status() from public,anon,authenticated;
grant execute on function public.get_account_age_status() to authenticated;

create function operations_helpers.confirm_age(p_birth_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'UTC')::date;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_birth_date is null or p_birth_date>today or p_birth_date<(today-interval '120 years')::date then raise exception 'Enter a valid birth date' using errcode='22023'; end if;
 if p_birth_date>(today-interval '18 years')::date then raise exception 'Pickle accounts require age 18 or over' using errcode='42501'; end if;
 -- Self-declaration only. Do not persist DOB or trust editable Auth metadata.
 insert into public.account_age_confirmations(user_id,rule_version,minimum_age) values(auth.uid(),'18-plus-v1',18) on conflict do nothing;
 return operations_helpers.age_status();
end; $$;
revoke all on function operations_helpers.confirm_age(date) from public,anon,authenticated;
grant execute on function operations_helpers.confirm_age(date) to authenticated;
create function public.confirm_account_age(p_birth_date date) returns jsonb
language sql security invoker set search_path='' as $$ select operations_helpers.confirm_age(p_birth_date); $$;
revoke all on function public.confirm_account_age(date) from public,anon,authenticated;
grant execute on function public.confirm_account_age(date) to authenticated;

create or replace function operations_helpers.can_act(p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_action in('publish','message','social','profile','content_upload','draft','report')
 and exists(select 1 from public.profiles where id=auth.uid())
 and auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and (p_action='report' or operations_helpers.age_eligible())
 and not exists(select 1 from public.account_sanctions s where s.user_id=auth.uid() and s.revoked_at is null and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and (
 (s.kind='report_limit_7' and p_action='report') or
 (s.kind='restrict_3' and p_action in('publish','message','content_upload')) or
 (s.kind in('suspend_7','suspend_30','permanent','temp_suspend') and p_action in('publish','message','social','profile','content_upload','draft'))
 ));
$$;
