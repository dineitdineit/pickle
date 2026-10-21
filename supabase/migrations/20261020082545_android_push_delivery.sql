create schema push_helpers;
revoke all on schema push_helpers from public,anon,authenticated;
grant usage on schema push_helpers to anon,authenticated,service_role;

create table push_helpers.devices (
 id uuid primary key,
 secret_hash bytea not null,
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null references auth.sessions(id) on delete cascade,
 token text not null unique check(length(token) between 32 and 4096),
 updated_at timestamptz not null default now()
);
create index devices_user_idx on push_helpers.devices(user_id);
create index devices_session_idx on push_helpers.devices(session_id);
alter table push_helpers.devices enable row level security;
revoke all on push_helpers.devices from public,anon,authenticated;

create table push_helpers.state (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 credential_ready boolean not null default false,
 checked_at timestamptz,
 status text not null default 'awaiting_configuration'
);
insert into push_helpers.state default values;
alter table push_helpers.state enable row level security;
revoke all on push_helpers.state from public,anon,authenticated;

create function push_helpers.device(p_action text,p_id uuid,p_secret text,p_token text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); sid uuid; existing push_helpers.devices;
begin
 if p_id is null or p_secret is null or p_secret !~ '^[a-f0-9]{64}$' then raise exception 'Invalid installation'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into existing from push_helpers.devices where id=p_id for update;
 if existing.id is not null and existing.secret_hash<>extensions.digest(p_secret,'sha256') then raise exception 'Installation mismatch' using errcode='42501'; end if;
 if p_action='remove' then
  delete from push_helpers.devices where id=p_id;
  return true;
 end if;
 if p_action<>'register' or uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
  or not operations_helpers.can_act('profile') or not guardian_helpers.public_allowed(uid) then raise exception 'Not permitted' using errcode='42501'; end if;
 sid:=(auth.jwt()->>'session_id')::uuid;
 if not exists(select 1 from auth.sessions where id=sid and user_id=uid) then raise exception 'Session unavailable' using errcode='42501'; end if;
 if p_token is null or length(p_token) not between 32 and 4096 or p_token ~ '[[:space:]]' then raise exception 'Invalid device token'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,1));
 if (select count(*) from push_helpers.devices where user_id=uid and id<>p_id)>=10 then raise exception 'Device limit reached'; end if;
 -- A token already owned by another installation cannot be silently reassigned.
 insert into push_helpers.devices(id,secret_hash,user_id,session_id,token)
 values(p_id,extensions.digest(p_secret,'sha256'),uid,sid,p_token)
 on conflict(id) do update set user_id=excluded.user_id,session_id=excluded.session_id,token=excluded.token,updated_at=now();
 return true;
end $$;
revoke all on function push_helpers.device(text,uuid,text,text) from public,anon,authenticated;
grant execute on function push_helpers.device(text,uuid,text,text) to anon,authenticated;

create function public.register_push_device(p_id uuid,p_secret text,p_token text) returns boolean
language sql security invoker set search_path='' as $$ select push_helpers.device('register',p_id,p_secret,p_token); $$;
revoke all on function public.register_push_device(uuid,text,text) from public,anon;
grant execute on function public.register_push_device(uuid,text,text) to authenticated;
-- Installation capability allows safe unlinking after the session has already ended.
create function public.remove_push_device(p_id uuid,p_secret text) returns boolean
language sql security invoker set search_path='' as $$ select push_helpers.device('remove',p_id,p_secret); $$;
revoke all on function public.remove_push_device(uuid,text) from public;
grant execute on function public.remove_push_device(uuid,text) to anon,authenticated;

create function push_helpers.status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'ready',credential_ready) from push_helpers.state where singleton and auth.uid() is not null;
$$;
revoke all on function push_helpers.status() from public,anon;
grant execute on function push_helpers.status() to authenticated;
create function public.push_delivery_status() returns jsonb language sql stable security invoker set search_path='' as $$select push_helpers.status();$$;
revoke all on function public.push_delivery_status() from public,anon;
grant execute on function public.push_delivery_status() to authenticated;

create table push_helpers.jobs (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references push_helpers.devices(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 notification_id uuid references public.user_notifications(id) on delete cascade,
 message_id bigint references public.direct_messages(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '1 day',
 attempts integer not null default 0,
 next_at timestamptz not null default now(),
 lease uuid,
 lease_until timestamptz,
 status text not null default 'pending' check(status in('pending','sent','skipped','failed')),
 check(num_nonnulls(notification_id,message_id)=1),
 unique(device_id,notification_id),unique(device_id,message_id)
);
create index push_jobs_ready_idx on push_helpers.jobs(next_at) where status='pending';
create index push_jobs_recipient_idx on push_helpers.jobs(recipient_id);
create index push_jobs_notification_idx on push_helpers.jobs(notification_id);
create index push_jobs_message_idx on push_helpers.jobs(message_id);
alter table push_helpers.jobs enable row level security;
revoke all on push_helpers.jobs from public,anon,authenticated;

create function push_helpers.enqueue() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not (select enabled from push_helpers.state where singleton) then return new; end if;
 insert into push_helpers.jobs(device_id,recipient_id,notification_id,message_id)
 select id,new.recipient_id,
 case when tg_table_name='user_notifications' then (to_jsonb(new)->>'id')::uuid end,
 case when tg_table_name='direct_messages' then (to_jsonb(new)->>'id')::bigint end
 from push_helpers.devices where user_id=new.recipient_id and updated_at>now()-interval '30 days'
 on conflict do nothing;
 return new;
end $$;
revoke all on function push_helpers.enqueue() from public,anon,authenticated;
create trigger enqueue_activity_push after insert on public.user_notifications for each row execute function push_helpers.enqueue();
create trigger enqueue_message_push after insert on public.direct_messages for each row execute function push_helpers.enqueue();

do $$begin
 if not exists(select 1 from vault.secrets where name='push_worker_secret') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'push_worker_secret','Internal Android push scheduler authentication');
 end if;
end$$;
notify pgrst,'reload schema';
