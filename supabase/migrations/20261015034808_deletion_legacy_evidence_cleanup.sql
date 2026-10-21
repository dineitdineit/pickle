create or replace function retention_helpers.worker(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare j retention_helpers.deletion_jobs; uid uuid; key text; result jsonb;
begin
 if p_action='verify_secret' then
  return to_jsonb(exists(select 1 from vault.decrypted_secrets where name='retention_worker_secret' and extensions.digest(decrypted_secret,'sha256')=extensions.digest(coalesce(p_payload->>'secret',''),'sha256')));
 elsif p_action='claim' then
  select * into j from retention_helpers.deletion_jobs where status<>'completed' and next_attempt_at<=now() and (lease_until is null or lease_until<now())
   and (p_payload->>'job_id' is null or id=(p_payload->>'job_id')::uuid) order by requested_at,id limit 1 for update skip locked;
  if j.id is null then return 'null'::jsonb; end if;
  update retention_helpers.deletion_jobs set status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '3 minutes',last_error=null where id=j.id returning * into j;
  return jsonb_build_object('id',j.id,'user_id',j.user_id,'lease',j.lease_token);
 elsif p_action='receipt' then
  select * into j from retention_helpers.deletion_jobs where status='completed' and expires_at>now()+interval '1 minute' and backup_verified_at is null order by completed_at limit 1;
  if j.id is null then return 'null'::jsonb; end if;
  return jsonb_build_object('id',j.id,'path',j.id::text||'.pgp','body',encode(j.encrypted_receipt,'base64'),'sha256',encode(extensions.digest(j.encrypted_receipt,'sha256'),'hex'),'expires_at',j.expires_at);
 elsif p_action='receipt_ack' then
  update retention_helpers.deletion_jobs set backup_verified_at=now() where id=(p_payload->>'id')::uuid and status='completed' and expires_at>now()
   and encode(extensions.digest(encrypted_receipt,'sha256'),'hex')=p_payload->>'sha256'
   and exists(select 1 from storage.objects where bucket_id='retention-backups' and name=(p_payload->>'id')||'.pgp');
  return to_jsonb(found);
 elsif p_action='expired' then
  return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
   select id as job_id,id::text||'.pgp' as path from retention_helpers.deletion_jobs where status='completed' and expires_at<=now()
   union all select null::uuid,o.name from storage.objects o where o.bucket_id='retention-backups' and o.created_at<=now()-interval '30 days'
    and not exists(select 1 from retention_helpers.deletion_jobs where id::text||'.pgp'=o.name)
   limit 50
  ) x);
 elsif p_action='expired_ack' then
  if exists(select 1 from storage.objects where bucket_id='retention-backups' and name=p_payload->>'path') then return 'false'::jsonb; end if;
  delete from retention_helpers.deletion_jobs where id=(p_payload->>'job_id')::uuid and status='completed' and expires_at<=now() and id::text||'.pgp'=p_payload->>'path';
  return 'true'::jsonb;
 end if;
 select * into j from retention_helpers.deletion_jobs where id=(p_payload->>'job_id')::uuid for update;
 if j.id is null or j.status<>'processing' or j.lease_token is distinct from (p_payload->>'lease')::uuid or j.lease_until<=now() then raise exception 'Invalid or expired job lease' using errcode='40001'; end if;
 uid:=j.user_id;
 if p_action='files' then
  perform retention_helpers.refresh_files(j.id);
  return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select id,bucket,path from retention_helpers.deletion_files where job_id=j.id and removed_at is null order by bucket,path limit 200) x);
 elsif p_action='files_ack' then
  update retention_helpers.deletion_files set removed_at=now() where job_id=j.id and id in(select value::uuid from jsonb_array_elements_text(p_payload->'ids'));
  return 'true'::jsonb;
 elsif p_action='ready' then
  perform retention_helpers.refresh_files(j.id);
  if exists(select 1 from retention_helpers.deletion_files where job_id=j.id and removed_at is null) then return 'false'::jsonb; end if;
  -- Do not keep copies of a departing user's core content in report snapshots.
  update public.content_reports set snapshot='{}',details=null,resolution_note=null where reported_user_id=uid;
  update public.content_reports set details=null,reporter_id=null where reporter_id=uid;
  update public.moderation_decisions set public_reason='Account deleted: detailed record removed.',internal_note='Account deleted: detailed record removed.',approval_note=null where subject_id=uid;
  update public.moderation_appeals a set explanation='Account deleted: detailed record removed.',response=null,internal_note=null where user_id=uid;
  update public.moderation_case_events e set note='Account deleted: detailed record removed.' where case_id in(select id from public.moderation_cases where subject_id=uid);
  update public.content_moderation_actions set note=null where target_id=uid or target_id in(select id from public.recipes where author_id=uid) or target_id in(select id from public.recipe_reviews where user_id=uid);
  update public.moderation_actions set note=null where comment_id in(select id from public.recipe_comments where user_id=uid);
  delete from public.search_events where user_id=uid;
  return 'true'::jsonb;
 elsif p_action='complete' then
  if exists(select 1 from auth.users where id=uid) or exists(select 1 from retention_helpers.deletion_files where job_id=j.id and removed_at is null) then raise exception 'Deletion is not complete'; end if;
  select decrypted_secret into key from vault.decrypted_secrets where name='retention_backup_key';
  if key is null then raise exception 'Backup encryption unavailable'; end if;
  update retention_helpers.deletion_jobs set status='completed',completed_at=now(),expires_at=now()+interval '30 days',lease_token=null,lease_until=null,last_error=null,
   encrypted_receipt=extensions.pgp_sym_encrypt(jsonb_build_object('version',1,'job_id',j.id,'user_id',uid,'requested_at',j.requested_at,'completed_at',now(),'expires_at',now()+interval '30 days','scope','account_and_uploaded_content_deleted')::text,key,'cipher-algo=aes256,compress-algo=1')
   where id=j.id;
  return jsonb_build_object('completed',true,'job_id',j.id);
 elsif p_action='retry' then
  if coalesce(p_payload->>'code','') not in('storage_cleanup_failed','auth_delete_failed','database_failed','batch_pending') then raise exception 'Invalid retry code'; end if;
  update retention_helpers.deletion_jobs set status='retry',last_error=p_payload->>'code',lease_token=null,lease_until=null,
   next_attempt_at=now()+case when p_payload->>'code'='batch_pending' then interval '5 seconds' else least(3600,power(2,least(attempts,7))::int*30)*interval '1 second' end where id=j.id;
  return 'true'::jsonb;
 end if;
 raise exception 'Unknown worker action' using errcode='22023';
end; $$;
