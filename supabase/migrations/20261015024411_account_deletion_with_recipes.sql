-- No live account is deleted by this migration. Cleanup runs only on an explicit authenticated deletion request.
do $$ declare constraint_name text; begin
 select c.conname into strict constraint_name from pg_constraint c
 where c.conrelid='public.recipes'::regclass and c.confrelid='public.profiles'::regclass and c.contype='f'
 and c.conkey=array[(select attnum from pg_attribute where attrelid='public.recipes'::regclass and attname='author_id')];
 execute format('alter table public.recipes drop constraint %I',constraint_name);
 alter table public.recipes add constraint recipes_author_id_fkey foreign key(author_id) references public.profiles(id) on delete cascade;
end; $$;

create table operations_helpers.account_deletions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 requested_at timestamptz not null default now()
);
alter table operations_helpers.account_deletions enable row level security;
revoke all on operations_helpers.account_deletions from public,anon,authenticated;
create policy no_client_deletion_records on operations_helpers.account_deletions for all to authenticated using(false) with check(false);
grant usage on schema operations_helpers to service_role;
create function operations_helpers.prepare_account_deletion(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account_role text;
begin
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||p_user::text,0));
 select role into account_role from public.profiles where id=p_user for update;
 if not found then raise exception 'Account not found' using errcode='22023'; end if;
 if account_role in('admin','official') then raise exception 'Staff deletion requires operator assistance' using errcode='42501'; end if;
 insert into operations_helpers.account_deletions(user_id) values(p_user) on conflict do nothing;
 update public.recipes set is_hidden=true where author_id=p_user and not is_hidden;
 return jsonb_build_object('user_id',p_user,'prepared',true);
end; $$;
revoke all on function operations_helpers.prepare_account_deletion(uuid) from public,anon,authenticated;
grant execute on function operations_helpers.prepare_account_deletion(uuid) to service_role;
create function public.prepare_account_deletion(p_user uuid) returns jsonb
language sql security invoker set search_path='' as $$ select operations_helpers.prepare_account_deletion(p_user); $$;
revoke all on function public.prepare_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;

create or replace function operations_helpers.can_act(p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_action in('publish','message','social','profile','content_upload','draft','report')
 and exists(select 1 from public.profiles where id=auth.uid())
 and auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and (p_action='report' or (operations_helpers.age_eligible() and not exists(select 1 from operations_helpers.account_deletions where user_id=auth.uid())))
 and not exists(select 1 from public.account_sanctions s where s.user_id=auth.uid() and s.revoked_at is null and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and (
 (s.kind='report_limit_7' and p_action='report') or
 (s.kind='restrict_3' and p_action in('publish','message','content_upload')) or
 (s.kind in('suspend_7','suspend_30','permanent','temp_suspend') and p_action in('publish','message','social','profile','content_upload','draft'))
 ));
$$;
create function operations_helpers.guard_deleting_recipient() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from operations_helpers.account_deletions where user_id=new.recipient_id) then raise exception 'Contact unavailable' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function operations_helpers.guard_deleting_recipient() from public,anon,authenticated;
create trigger deleting_recipient before insert on public.direct_messages for each row execute function operations_helpers.guard_deleting_recipient();
