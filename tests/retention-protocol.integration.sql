-- Only synthetic fixtures, wrapped in BEGIN / ROLLBACK. No real images or email jobs.
select set_config('test.retention_user',gen_random_uuid()::text,true);
select set_config('test.retention_recipe',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values(current_setting('test.retention_user')::uuid,'fixture-'||current_setting('test.retention_user')||'@example.invalid',jsonb_build_object('username','retention_'||replace(current_setting('test.retention_user'),'-','')));
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id) values('Fixture recipe summary',current_setting('test.retention_recipe')::uuid,'Retention fixture','Easy',10,current_setting('test.retention_user')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.retention_user'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare denied boolean; begin
 denied:=false; begin perform public.retention_worker('claim'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Client invoked service worker'; end if;
 denied:=false; begin perform public.admin_retention_status(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-admin saw retention jobs'; end if;
 denied:=false; begin perform public.admin_retry_account_deletion(gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-admin retried deletion'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.retention_job',public.prepare_account_deletion(current_setting('test.retention_user')::uuid)->>'job_id',true);
select set_config('test.retention_lease',public.retention_worker('claim',jsonb_build_object('job_id',current_setting('test.retention_job')))->>'lease',true);
do $$ declare denied boolean:=false; begin
 if public.retention_worker('claim',jsonb_build_object('job_id',current_setting('test.retention_job')))<>'null'::jsonb then raise exception 'Duplicate lease'; end if;
 begin perform public.retention_worker('ready',jsonb_build_object('job_id',current_setting('test.retention_job'),'lease',gen_random_uuid())); exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Forged lease accepted'; end if;
 if public.retention_worker('ready',jsonb_build_object('job_id',current_setting('test.retention_job'),'lease',current_setting('test.retention_lease')))<>'true'::jsonb then raise exception 'Empty manifest not ready'; end if;
 if public.retention_worker('verify_secret',jsonb_build_object('secret',repeat('0',64)))<>'false'::jsonb then raise exception 'Invalid scheduler secret accepted'; end if;
end; $$;
reset role;
delete from auth.users where id=current_setting('test.retention_user')::uuid;
set local role service_role;
select public.retention_worker('complete',jsonb_build_object('job_id',current_setting('test.retention_job'),'lease',current_setting('test.retention_lease')));
reset role;
do $$ declare j retention_helpers.deletion_jobs; decrypted jsonb; key text; begin
 select * into j from retention_helpers.deletion_jobs where id=current_setting('test.retention_job')::uuid;
 if j.status<>'completed' or j.expires_at<>j.completed_at+interval '30 days' or j.encrypted_receipt is null then raise exception 'Receipt TTL/encryption missing'; end if;
 if exists(select 1 from public.recipes where id=current_setting('test.retention_recipe')::uuid) then raise exception 'Recipe survived deletion'; end if;
 select decrypted_secret into key from vault.decrypted_secrets where name='retention_backup_key';
 decrypted:=extensions.pgp_sym_decrypt(j.encrypted_receipt,key)::jsonb;
 if decrypted ? 'email' or decrypted ? 'recipes' or decrypted ? 'photos' or decrypted->>'job_id'<>j.id::text then raise exception 'Backup is not minimal'; end if;
end; $$;
insert into storage.objects(bucket_id,name) values('retention-backups',current_setting('test.retention_job')||'.pgp');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles limit 1),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from storage.objects where bucket_id='retention-backups') then raise exception 'Private backup metadata leaked'; end if; end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update retention_helpers.deletion_jobs set completed_at=now()-interval '31 days',expires_at=now()-interval '1 day' where id=current_setting('test.retention_job')::uuid;
set local role service_role;
do $$ begin
 if public.retention_worker('receipt')<>'null'::jsonb then raise exception 'Expired backup made available'; end if;
 if public.retention_worker('expired_ack',jsonb_build_object('job_id',current_setting('test.retention_job'),'path',current_setting('test.retention_job')||'.pgp'))<>'false'::jsonb then raise exception 'Ledger erased before Storage deletion'; end if;
end; $$;
reset role;
select 'Service/admin restrictions, idempotent leases, minimal encrypted receipt, 30-day expiry, private Storage access and cleanup acknowledgement passed' as result;
