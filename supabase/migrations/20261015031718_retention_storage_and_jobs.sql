create schema retention_helpers;
revoke all on schema retention_helpers from public,anon,authenticated;
grant usage on schema retention_helpers to service_role,authenticated;
create table retention_helpers.deletion_jobs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique,
 status text not null default 'pending' check(status in('pending','processing','retry','completed')),
 requested_at timestamptz not null default now(), completed_at timestamptz, expires_at timestamptz,
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, last_error text,
 encrypted_receipt bytea, backup_verified_at timestamptz,
 check((status='completed')=(completed_at is not null)),
 check((completed_at is null and expires_at is null) or expires_at=completed_at+interval '30 days')
);
create index retention_jobs_queue on retention_helpers.deletion_jobs(status,next_attempt_at,lease_until);
create index retention_jobs_expiry on retention_helpers.deletion_jobs(expires_at);
create table retention_helpers.deletion_files (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references retention_helpers.deletion_jobs on delete cascade,
 bucket text not null check(bucket in('avatars','community_recipe_images','chat_images')),
 path text not null, removed_at timestamptz, unique(job_id,bucket,path)
);
create index retention_files_pending on retention_helpers.deletion_files(job_id) where removed_at is null;
create table retention_helpers.runs (
 id bigint generated always as identity primary key, started_at timestamptz not null default now(),
 results jsonb not null default '{}'
);
do $$ declare tab text; begin
 foreach tab in array array['deletion_jobs','deletion_files','runs'] loop
 execute format('alter table retention_helpers.%I enable row level security',tab);
 execute format('revoke all on retention_helpers.%I from public,anon,authenticated',tab);
 execute format('create policy no_client_access on retention_helpers.%I for all to authenticated using(false) with check(false)',tab);
 end loop;
end; $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('retention-backups','retention-backups',false,1048576,array['application/octet-stream']) on conflict(id) do nothing;
-- No anon/authenticated Storage policy is granted for this bucket. Never create signed/public URLs.
do $$ begin
 if not exists(select 1 from vault.secrets where name='retention_backup_key') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'retention_backup_key','Encryption key for minimal deletion receipts; never export to the app');
 end if;
 if not exists(select 1 from vault.secrets where name='retention_worker_secret') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'retention_worker_secret','Private retention scheduler authentication');
 end if;
end; $$;

create function retention_helpers.refresh_files(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 select user_id into uid from retention_helpers.deletion_jobs where id=p_job;
 if uid is null then raise exception 'Job not found'; end if;
 insert into retention_helpers.deletion_files(job_id,bucket,path)
 select p_job,o.bucket_id,o.name from storage.objects o
 where o.bucket_id in('avatars','community_recipe_images','chat_images') and split_part(o.name,'/',1)=uid::text
 union select p_job,'chat_images',m.image_path from public.direct_messages m join storage.objects o on o.bucket_id='chat_images' and o.name=m.image_path where (m.sender_id=uid or m.recipient_id=uid) and m.image_path is not null
 on conflict(job_id,bucket,path) do update set removed_at=null;
end; $$;
revoke all on function retention_helpers.refresh_files(uuid) from public,anon,authenticated;

create or replace function operations_helpers.prepare_account_deletion(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account_role text; job retention_helpers.deletion_jobs;
begin
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||p_user::text,0));
 select * into job from retention_helpers.deletion_jobs where user_id=p_user for update;
 if job.id is not null then return jsonb_build_object('user_id',p_user,'prepared',true,'job_id',job.id,'completed',job.status='completed'); end if;
 select role into account_role from public.profiles where id=p_user for update;
 if not found then raise exception 'Account not found' using errcode='22023'; end if;
 if account_role in('admin','official') then raise exception 'Staff deletion requires operator assistance' using errcode='42501'; end if;
 insert into operations_helpers.account_deletions(user_id) values(p_user) on conflict do nothing;
 insert into retention_helpers.deletion_jobs(user_id) values(p_user) returning * into job;
 perform retention_helpers.refresh_files(job.id);
 update public.profiles set moderation_hidden=true where id=p_user;
 update public.recipes set is_hidden=true where author_id=p_user and not is_hidden;
 update public.recipe_reviews set moderation_status='hidden' where user_id=p_user and moderation_status='active';
 update public.recipe_comments set moderation_status='hidden' where user_id=p_user and moderation_status='active';
 return jsonb_build_object('user_id',p_user,'prepared',true,'job_id',job.id,'completed',false);
end; $$;

create function retention_helpers.guard_storage_write() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.bucket_id='retention-backups' then
  if auth.uid() is not null then raise exception 'Server-only storage' using errcode='42501'; end if;
  perform 1 from retention_helpers.deletion_jobs where id::text||'.pgp'=new.name and status='completed' and expires_at>clock_timestamp() for key share;
  if not found then raise exception 'Backup expired or unrecognised' using errcode='42501'; end if;
  return new;
 end if;
 if auth.uid() is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||auth.uid()::text,0));
 if not operations_helpers.can_act('content_upload') then raise exception 'Account cannot upload content' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function retention_helpers.guard_storage_write() from public,anon,authenticated;
create trigger retention_storage_guard before insert or update on storage.objects for each row execute function retention_helpers.guard_storage_write();
