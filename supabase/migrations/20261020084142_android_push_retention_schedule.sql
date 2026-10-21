create function push_helpers.purge() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from push_helpers.devices where updated_at<=now()-interval '30 days';
 delete from push_helpers.jobs where expires_at<=now();
end$$;
revoke all on function push_helpers.purge() from public,anon,authenticated;
select cron.schedule('pickle-push-expiry','* * * * *','select push_helpers.purge();');
-- The database gate remains false. The Edge Function also checks the separate
-- PUSH_DELIVERY_ENABLED secret. Both gates must be enabled to send anything.
select cron.schedule('pickle-android-push','* * * * *','select push_helpers.dispatch() where exists(select 1 from push_helpers.state where singleton and enabled);');

create or replace function push_helpers.worker(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j push_helpers.jobs; result jsonb;
begin
 if p_action='verify_secret' then
  return to_jsonb(exists(select 1 from vault.decrypted_secrets where name='push_worker_secret' and extensions.digest(decrypted_secret,'sha256')=extensions.digest(coalesce(p_payload->>'secret',''),'sha256')));
 elsif p_action='status' then
  update push_helpers.state set credential_ready=coalesce((p_payload->>'ready')::boolean,false),checked_at=now(),status=case when p_payload->>'status' in('disabled','ready','invalid_credential','credential_missing','provider_auth_failed') then p_payload->>'status' else 'invalid_credential' end where singleton;
  return 'true';
 elsif p_action='claim' then
  delete from push_helpers.devices where updated_at<=now()-interval '30 days';
  delete from push_helpers.jobs where expires_at<=now();
  if not exists(select 1 from push_helpers.state where enabled and credential_ready) then return 'null'; end if;
  select * into j from push_helpers.jobs where status='pending' and attempts<5 and next_at<=now() and (lease_until is null or lease_until<now()) order by next_at limit 1 for update skip locked;
  if j.id is null then return 'null'; end if;
  if not push_helpers.allowed(j.id) then
   update push_helpers.jobs set status='skipped' where id=j.id;
   return jsonb_build_object('skipped',true);
  end if;
  update push_helpers.jobs set attempts=attempts+1,lease=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=j.id returning * into j;
  return jsonb_build_object('id',j.id,'lease',j.lease);
 elsif p_action='prepare' then
  select * into j from push_helpers.jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and status='pending' and lease_until>now();
  if j.id is null or not push_helpers.allowed(j.id) then return 'null'; end if;
  select jsonb_build_object('token',d.token,'recipient',j.recipient_id,'installation',d.id,
   'kind',case when j.message_id is not null then 'message' else 'activity' end,
   'target',coalesce(j.notification_id::text,j.message_id::text),'tag','pickle-'||j.id::text)
  into result from push_helpers.devices d where id=j.device_id and user_id=j.recipient_id;
  return result;
 elsif p_action='ack' then
  select * into j from push_helpers.jobs where id=(p_payload->>'id')::uuid and lease=(p_payload->>'lease')::uuid and status='pending' for update;
  if j.id is null then return 'false'; end if;
  if p_payload->>'outcome'='invalid_token' then
   delete from push_helpers.devices where id=j.device_id and token=p_payload->>'token';
  else
   update push_helpers.jobs set status=case p_payload->>'outcome' when 'sent' then 'sent' when 'skipped' then 'skipped' when 'failed' then 'failed' else case when attempts>=5 then 'failed' else 'pending' end end,
    lease=null,lease_until=null,next_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) where id=j.id;
  end if;
  return 'true';
 end if;
 raise exception 'Invalid worker action';
end$$;
