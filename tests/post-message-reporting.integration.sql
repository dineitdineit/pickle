-- Synthetic users, text and Storage metadata. No uploaded files or dispatch.
begin;
set local statement_timeout='10s';
create temp table f as select gen_random_uuid() author,gen_random_uuid() reporter,gen_random_uuid() stranger,gen_random_uuid() admin,gen_random_uuid() post,gen_random_uuid() comment,gen_random_uuid() reply,gen_random_uuid() message_client,gen_random_uuid() session_id,gen_random_uuid() device_id;
grant select on f to authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','safety_'||replace(i::text,'-','')) from f,lateral(values(author),(reporter),(stranger),(admin))a(i);
do $$declare i uuid;begin for i in select author from f union all select reporter from f union all select stranger from f union all select admin from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end$$;
update public.profiles set role='official' where id=(select admin from f);
insert into auth.sessions(id,user_id) select session_id,reporter from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',reporter,'session_id',session_id,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.register_push_device(device_id,repeat('a',64),'synthetic-moderation-push-token-never-dispatched') from f;
reset role;
update push_helpers.state set enabled=true,credential_ready=true;
select set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated','is_anonymous',false)::text,true) from f;
insert into storage.objects(bucket_id,name) select 'community_recipe_images',author||'/'||post||'/photo.webp' from f
union all select 'chat_images',author||'/'||reporter||'/'||message_client||'.webp' from f;
insert into public.photo_posts(id,author_id,status,published_at,caption) select post,author,'published',now(),'Reported fixture caption' from f;
insert into public.post_photos(post_id,image_path,position) select post,'community:'||author||'/'||post||'/photo.webp',0 from f;
insert into public.post_comments(id,post_id,user_id,content) select comment,post,author,'Reported fixture comment' from f;
insert into public.direct_messages(sender_id,recipient_id,client_id,body) select author,reporter,gen_random_uuid(),'UNRELATED PRIVATE MESSAGE' from f;
insert into public.direct_messages(sender_id,recipient_id,client_id,body) select author,stranger,gen_random_uuid(),'OTHER CONVERSATION SECRET' from f;
insert into public.direct_messages(sender_id,recipient_id,client_id,body,image_path) select author,reporter,message_client,'Selected reported message',author||'/'||reporter||'/'||message_client||'.webp' from f;
create temp table msg as select report_id,image_path from public.direct_messages where client_id=(select message_client from f);
do $$declare job uuid;begin
 select j.id into job from push_helpers.jobs j join public.direct_messages m on m.id=j.message_id where m.report_id=(select report_id from msg);
 if job is null or not push_helpers.allowed(job) then raise exception 'Synthetic pre-moderation push was not eligible';end if;
end$$;
grant select on msg to authenticated,anon;
select set_config('request.jwt.claims',jsonb_build_object('sub',reporter,'role','authenticated','is_anonymous',false)::text,true) from f;
insert into public.post_comments(id,post_id,user_id,parent_id,content) select reply,post,reporter,comment,'Reply to hide with root' from f;
set local role authenticated;
do $$declare first_report jsonb;again jsonb;begin
 perform public.submit_content_report('post',(select post from f),'spam','Synthetic post evidence');
 perform public.submit_content_report('post_comment',(select comment from f),'harassment','Synthetic comment evidence');
 first_report:=public.submit_content_report('message',(select report_id from msg),'harassment','Synthetic selected-message evidence');
 again:=public.submit_content_report('message',(select report_id from msg),'spam','Retry must not duplicate');
 if first_report->>'id'<>again->>'id' then raise exception 'Report retry duplicated';end if;
 begin perform public.get_moderation_case_context((select post from f));raise exception 'Non-admin context permitted';exception when insufficient_privilege then null;end;
 begin update public.direct_messages set is_hidden=true;raise exception 'Client moderation flags writable';exception when insufficient_privilege then null;end;
 if not message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Recipient lost ordinary photo';end if;
end$$;
reset role;
do $$begin if (select count(*) from public.content_reports where reporter_id=(select reporter from f))<>3 then raise exception 'Wrong intake count';end if;end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',stranger,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
 begin perform public.submit_content_report('message',(select report_id from msg),'other','Not a participant');raise exception 'Stranger reported private message';exception when no_data_found then null;end;
 if exists(select 1 from public.direct_messages where report_id=(select report_id from msg)) then raise exception 'Stranger read message';end if;
 if message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Stranger read photo';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$declare c public.moderation_cases;detail jsonb;outcome text;begin
 if exists(select 1 from public.direct_messages where report_id=(select report_id from msg)) then raise exception 'Admin received unreported conversation access';end if;
 for c in select * from public.moderation_cases where subject_id=(select author from f) order by target_type loop
  if c.target_type='message' then
   detail:=public.get_moderation_case_context(c.id);
   if detail::text like '%UNRELATED PRIVATE%' or detail::text like '%OTHER CONVERSATION%' or detail::text like '%recipient_id%' then raise exception 'Full conversation leaked';end if;
   if detail->'target'->>'content'<>'Selected reported message' or jsonb_array_length(detail->'images')<>1 then raise exception 'Selected message evidence missing';end if;
   if not message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Admin cannot review reported photo';end if;
  end if;
  if not exists(select 1 from jsonb_array_elements(public.admin_content_reports(c.target_type)->'reports')r where r->>'target_id'=c.target_id::text) then raise exception 'Admin filter missed type %',c.target_type;end if;
  perform public.triage_moderation_case(c.id,c.updated_at,auth.uid(),'normal','Synthetic selected evidence reviewed');
  select * into c from public.moderation_cases where id=c.id;
  outcome:=case when c.target_type='post_comment' then 'remove' else 'hide' end;
  perform public.decide_moderation_case(c.id,c.updated_at,outcome,'standard','harassment','This selected content violates the harassment policy.','INTERNAL REVIEW NOTE NEVER SENT TO AUTHOR','none');
 end loop;
end$$;
reset role;
do $$begin
 if exists(select 1 from push_helpers.jobs j join public.direct_messages m on m.id=j.message_id where m.report_id=(select report_id from msg) and push_helpers.allowed(j.id)) then raise exception 'Moderated message still eligible for push';end if;
 if (select count(*) from moderation_helpers.email_outbox where recipient_id=(select author from f))<>3 then raise exception 'Author emails not queued';end if;
 if exists(select 1 from moderation_helpers.email_outbox where recipient_id=(select author from f) and (body like '%INTERNAL REVIEW NOTE%' or body like '%Selected reported message%' or body like '%UNRELATED%' or body like '%'||(select reporter from f)::text||'%')) then raise exception 'Private details leaked in email';end if;
 if (select count(*) from public.user_notifications where recipient_id=(select author from f) and kind='moderation' and moderation_details->>'type' in('post','post_comment','message'))<>3 then raise exception 'Typed author notices missing';end if;
end$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',reporter,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
 if exists(select 1 from public.photo_posts where id=(select post from f)) then raise exception 'Hidden post visible';end if;
 if exists(select 1 from public.post_comments where id in(select comment from f union all select reply from f)) then raise exception 'Moderated comment/thread visible';end if;
 if exists(select 1 from public.direct_messages where report_id=(select report_id from msg)) then raise exception 'Hidden message body visible';end if;
 if exists(select 1 from public.get_message_inbox() where latest_body like '%Selected reported message%') then raise exception 'Inbox leaked moderated message';end if;
 if message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Recipient can fetch moderated photo';end if;
 if exists(select 1 from storage.objects where bucket_id='chat_images' and name=(select image_path from msg)) then raise exception 'Storage policy bypass';end if;
 if exists(select 1 from public.content_reports where reporter_id<>(select reporter from f)) then raise exception 'Other reporter evidence leaked';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',author,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
 if message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Sender upload permission bypassed moderation';end if;
 if message_helpers.can_delete_unsent((select image_path from msg)) then raise exception 'Hidden sent photo deletable as unsent';end if;
 if public.get_my_moderation()::text like '%INTERNAL REVIEW NOTE%' then raise exception 'Internal notes leaked to author';end if;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$declare d public.moderation_decisions;begin
 for d in select * from public.moderation_decisions where subject_id=(select author from f) and state='confirmed' loop
 perform public.revoke_moderation_decision(d.id,'Synthetic reversal restores selected content.','Uninvolved operator reviewed synthetic reversal.');
 end loop;
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',reporter,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
 if not exists(select 1 from public.photo_posts where id=(select post from f)) or not exists(select 1 from public.post_comments where id=(select comment from f)) or not exists(select 1 from public.direct_messages where report_id=(select report_id from msg)) then raise exception 'Reversal failed to restore selected content';end if;
 if not message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Reversal did not restore photo access';end if;
end$$;
reset role;
-- Expired evidence cannot be reloaded as current content or as a chat image.
update public.moderation_cases set evidence_expires_at=now()-interval '1 second' where subject_id=(select author from f);
select set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
 begin perform public.get_moderation_case_context((select id from public.moderation_cases where subject_id=(select author from f) limit 1));raise exception 'Expired context accessible';exception when insufficient_privilege then null;end;
 if message_helpers.can_read_photo((select image_path from msg)) then raise exception 'Expired case permitted chat photo access';end if;
end$$;
reset role;
set local role anon;
do $$begin begin perform public.submit_content_report('message',(select report_id from msg),'spam',null);raise exception 'Guest report permitted';exception when insufficient_privilege then null;end;end$$;
reset role;
rollback;
