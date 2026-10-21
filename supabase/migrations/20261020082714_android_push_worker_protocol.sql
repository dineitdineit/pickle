-- Runs only inside the private worker. Reuse viewer-sensitive visibility helpers
-- under the recipient's identity, restoring request claims before returning.
create function push_helpers.allowed(p_job uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare j push_helpers.jobs; d push_helpers.devices; n public.user_notifications; m public.direct_messages;
 pref public.notification_preferences; old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true); ok boolean:=false;
begin
 select * into j from push_helpers.jobs where id=p_job;
 select * into d from push_helpers.devices where id=j.device_id and user_id=j.recipient_id and updated_at>now()-interval '30 days';
 if d.id is null or j.expires_at<=now() or not guardian_helpers.public_allowed(j.recipient_id)
 or exists(select 1 from operations_helpers.account_deletions where user_id=j.recipient_id)
 or not exists(select 1 from public.profiles where id=j.recipient_id and not moderation_hidden)
 or not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.user_id) then return false; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',j.recipient_id,'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',j.recipient_id::text,true);
 select * into pref from public.notification_preferences where user_id=j.recipient_id;
 if j.message_id is not null then
  select * into m from public.direct_messages where id=j.message_id and recipient_id=j.recipient_id and read_at is null;
  ok:=m.id is not null and not blocking_helpers.pair_blocked(m.sender_id,m.recipient_id)
   and guardian_helpers.public_allowed(m.sender_id)
   and exists(select 1 from public.profiles where id=m.sender_id and not moderation_hidden)
   and not exists(select 1 from operations_helpers.account_deletions where user_id=m.sender_id);
 else
  select * into n from public.user_notifications where id=j.notification_id and recipient_id=j.recipient_id and read_at is null;
  if n.id is not null then
   if n.kind='moderation' then ok:=true;
   elsif coalesce(pref.enabled,true) and not blocking_helpers.pair_blocked(n.actor_id,n.recipient_id)
    and guardian_helpers.public_allowed(n.actor_id)
    and exists(select 1 from public.profiles where id=n.actor_id and not moderation_hidden)
    and not exists(select 1 from operations_helpers.account_deletions where user_id=n.actor_id) then
    ok:=case n.kind
     when 'follow' then coalesce(pref.follows,true) and exists(select 1 from public.user_follows where follower_id=n.actor_id and followed_id=n.recipient_id)
     when 'new_recipe' then coalesce(pref.recipes,true) and post_helpers.can_tag_recipe(n.recipe_id) and exists(select 1 from public.user_follows where follower_id=n.recipient_id and followed_id=n.actor_id and notify_new_recipes)
     when 'recipe_comment' then coalesce(pref.comments,true) and comment_alert_helpers.visible(n.comment_id)
     when 'comment_reply' then coalesce(pref.replies,true) and comment_alert_helpers.visible(n.comment_id)
     when 'recipe_photo_post' then coalesce(pref.comments,true) and post_helpers.public_post(n.post_id) and post_helpers.can_tag_recipe(n.recipe_id)
     when 'post_comment' then coalesce(pref.comments,true) and post_helpers.comment_visible(n.post_comment_id) and exists(select 1 from public.post_comments where id=n.post_comment_id and deleted_at is null)
     when 'post_reply' then coalesce(pref.replies,true) and post_helpers.comment_visible(n.post_comment_id) and exists(select 1 from public.post_comments where id=n.post_comment_id and deleted_at is null)
     else false end;
   end if;
  end if;
 end if;
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 return coalesce(ok,false);
exception when others then
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 raise;
end$$;
revoke all on function push_helpers.allowed(uuid) from public,anon,authenticated;

create function push_helpers.worker(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j push_helpers.jobs; result jsonb;
begin
 if p_action='verify_secret' then
  return to_jsonb(exists(select 1 from vault.decrypted_secrets where name='push_worker_secret' and extensions.digest(decrypted_secret,'sha256')=extensions.digest(coalesce(p_payload->>'secret',''),'sha256')));
 elsif p_action='status' then
  update push_helpers.state set credential_ready=coalesce((p_payload->>'ready')::boolean,false),checked_at=now(),status=case when p_payload->>'status' in('disabled','ready','invalid_credential','credential_missing','provider_auth_failed') then p_payload->>'status' else 'invalid_credential' end;
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
   delete from push_helpers.devices where id=j.device_id;
  else
   update push_helpers.jobs set status=case p_payload->>'outcome' when 'sent' then 'sent' when 'skipped' then 'skipped' when 'failed' then 'failed' else case when attempts>=5 then 'failed' else 'pending' end end,
    lease=null,lease_until=null,next_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)) where id=j.id;
  end if;
  return 'true';
 end if;
 raise exception 'Invalid worker action';
end$$;
revoke all on function push_helpers.worker(text,jsonb) from public,anon,authenticated;
grant execute on function push_helpers.worker(text,jsonb) to service_role;
create function public.push_worker(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select push_helpers.worker(p_action,p_payload);$$;
revoke all on function public.push_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.push_worker(text,jsonb) to service_role;

create function push_helpers.dispatch() returns bigint language plpgsql security definer set search_path='' as $$
declare secret text;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='push_worker_secret';
 if secret is null then return null; end if;
 return net.http_post(url=>'https://ztfwzwyyaaoexqtilpsw.supabase.co/functions/v1/android-push-worker',headers=>jsonb_build_object('Content-Type','application/json','X-Push-Worker-Secret',secret),body=>'{}'::jsonb,timeout_milliseconds=>55000);
end$$;
revoke all on function push_helpers.dispatch() from public,anon,authenticated;
-- Scheduler is installed only after the function deployment has been verified.
notify pgrst,'reload schema';
