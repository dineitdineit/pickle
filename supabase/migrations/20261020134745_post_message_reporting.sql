alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check check(target_type in('recipe','review','user','post','post_comment','message'));
alter table public.moderation_cases drop constraint moderation_cases_target_type_check;
alter table public.moderation_cases add constraint moderation_cases_target_type_check check(target_type in('recipe','review','comment','user','post','post_comment','message'));
alter table public.photo_posts add column moderation_removed boolean not null default false;
alter table public.post_comments add column is_hidden boolean not null default false;
alter table public.post_comments add column moderation_removed boolean not null default false;
alter table public.direct_messages add column report_id uuid not null default gen_random_uuid() unique;
alter table public.direct_messages add column is_hidden boolean not null default false;
alter table public.direct_messages add column moderation_removed boolean not null default false;
grant select(report_id,is_hidden,moderation_removed) on public.direct_messages to authenticated;
-- No client can write moderation flags or replace the immutable report handle.
create policy moderated_messages on public.direct_messages as restrictive for select to authenticated using(not is_hidden and not moderation_removed);

create or replace function moderation_helpers.submit_content_report(p_type text,p_target_id uuid,p_reason text,p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner_id uuid; rid uuid; snap jsonb; report_id uuid;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not operations_helpers.can_act('report') then raise exception 'Authentication and reporting permission required' using errcode='42501';end if;
 if p_type is null or p_type not in('recipe','review','user','post','post_comment','message') or p_target_id is null or p_reason is null or p_reason not in('spam','harassment','hate_or_abusive','sexual_content','personal_information','off_topic','other') or char_length(coalesce(p_details,''))>500 then raise exception 'Invalid report' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('reporter:'||uid::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_type||':'||p_target_id::text,0));
 select r.id into report_id from public.content_reports r where r.target_type=p_type and r.target_id=p_target_id and r.reporter_id=uid and r.status='open';
 if report_id is not null then return jsonb_build_object('id',report_id,'target_type',p_type,'target_id',p_target_id,'status','open');end if;
 if (select count(*) from public.content_reports where reporter_id=uid and created_at>now()-interval '1 day')>=30 then raise exception 'Daily report limit reached. For urgent help contact admin@getpickleapp.com.' using errcode='54000';end if;
 if p_type='recipe' then
 select r.author_id,r.id,jsonb_build_object('title',r.title,'content',coalesce(r.short_description,r.description,'')) into owner_id,rid,snap from public.recipes r where r.id=p_target_id and blocking_helpers.recipe_accessible(r.id) and not r.moderation_removed;
 elsif p_type='review' then
 select v.user_id,v.recipe_id,jsonb_build_object('title',r.title,'rating',v.rating,'content',v.content) into owner_id,rid,snap from public.recipe_reviews v join public.recipes r on r.id=v.recipe_id where v.id=p_target_id and v.moderation_status='active' and not v.moderation_removed and blocking_helpers.recipe_accessible(r.id) and not blocking_helpers.viewer_blocked(v.user_id);
 elsif p_type='user' then
 select p.id,null::uuid,jsonb_build_object('title',coalesce(nullif(p.display_name,''),p.username),'username',p.username,'content',coalesce(p.bio,'')) into owner_id,rid,snap from public.profiles p where p.id=p_target_id and guardian_helpers.public_allowed(p.id) and not p.moderation_hidden;
 elsif p_type='post' then
 select p.author_id,null::uuid,jsonb_build_object('title','Photo post','content',p.caption,'images',coalesce((select jsonb_agg(image_path order by position) from public.post_photos where post_id=p.id),'[]'::jsonb)) into owner_id,rid,snap from public.photo_posts p where p.id=p_target_id and post_helpers.public_post(p.id) and not p.moderation_removed;
 elsif p_type='post_comment' then
 select c.user_id,null::uuid,jsonb_build_object('title','Photo-post comment','content',c.content,'post_id',c.post_id,'parent_id',c.parent_id) into owner_id,rid,snap from public.post_comments c where c.id=p_target_id and c.deleted_at is null and not c.is_hidden and not c.moderation_removed and post_helpers.comment_visible(c.id);
 elsif p_type='message' then
 -- A report handle is not an access token. Only the recipient may report this
 -- exact received message, including after blocking its sender.
 select m.sender_id,null::uuid,jsonb_build_object('title','Reported message','content',m.body,'sent_at',m.created_at,'image',case when m.image_path is not null then 'chat:'||m.image_path end) into owner_id,rid,snap from public.direct_messages m where m.report_id=p_target_id and m.recipient_id=uid and not m.is_hidden and not m.moderation_removed;
 end if;
 if owner_id is null then raise exception 'Content is unavailable for reporting' using errcode='P0002';end if;
 if owner_id=uid then raise exception 'You cannot report your own content' using errcode='22023';end if;
 insert into public.content_reports(target_type,target_id,recipe_id,reporter_id,reported_user_id,reason,details,snapshot)
 values(p_type,p_target_id,rid,uid,owner_id,p_reason,nullif(btrim(p_details),''),snap) returning id into report_id;
 return jsonb_build_object('id',report_id,'target_type',p_type,'target_id',p_target_id,'status','open');
end$$;

-- Private chat media is readable for a live, unmoderated message participant,
-- an unsent owner upload, or an administrator reviewing unexpired case evidence.
create function message_helpers.can_read_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and (
 exists(select 1 from public.direct_messages m where m.image_path=p_path and auth.uid() in(m.sender_id,m.recipient_id) and not m.is_hidden and not m.moderation_removed and not blocking_helpers.pair_blocked(m.sender_id,m.recipient_id))
 or (message_helpers.can_upload_photo(p_path) and not exists(select 1 from public.direct_messages m where m.image_path=p_path))
 or (private.is_admin() and exists(select 1 from public.content_reports r join public.moderation_case_reports l on l.source='content' and l.report_id=r.id join public.moderation_cases c on c.id=l.case_id where r.target_type='message' and r.snapshot->>'image'='chat:'||p_path and c.evidence_deleted_at is null and (c.status<>'closed' or c.evidence_expires_at>now() or exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=c.id and a.status='open')))));
$$;
revoke all on function message_helpers.can_read_photo(text) from public,anon;
grant execute on function message_helpers.can_read_photo(text) to authenticated;
create function message_helpers.can_delete_unsent(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and split_part(p_path,'/',1)=auth.uid()::text
 and not exists(select 1 from public.direct_messages m where m.image_path=p_path)
 and not exists(select 1 from public.content_reports r where r.target_type='message' and r.snapshot->>'image'='chat:'||p_path);
$$;
revoke all on function message_helpers.can_delete_unsent(text) from public,anon;
grant execute on function message_helpers.can_delete_unsent(text) to authenticated;
alter policy chat_photo_read on storage.objects using(bucket_id='chat_images' and message_helpers.can_read_photo(name));
alter policy chat_photo_delete_unsent on storage.objects using(bucket_id='chat_images' and message_helpers.can_delete_unsent(name));
create policy chat_moderation_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'chat_images' or message_helpers.can_read_photo(name));

-- A report snapshot preserves only the selected message. Other conversation
-- rows are never included, even in the admin context endpoint.
CREATE OR REPLACE FUNCTION moderation_helpers.admin_content_reports(p_type text DEFAULT 'all'::text, p_status text DEFAULT 'open'::text, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; total bigint;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_type is null or p_type not in ('all','recipe','review','user','post','post_comment','message') or p_status is null or p_status not in ('all','open','actioned','dismissed') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid filter' using errcode='22023'; end if;
 select count(*) into total from public.content_reports r where (p_type='all' or r.target_type=p_type) and (p_status='all' or r.status=p_status);
 select coalesce(jsonb_agg(item order by created_at desc,id),'[]'::jsonb) into result from (
  select r.created_at,r.id,to_jsonb(r)||jsonb_build_object(
   'reporter_name',(select coalesce(nullif(p.display_name,''),p.username) from public.profiles p where p.id=r.reporter_id),
   'reported_name',(select coalesce(nullif(p.display_name,''),p.username) from public.profiles p where p.id=r.reported_user_id),
   'target_state',case r.target_type when 'recipe' then (select case when x.is_hidden then 'hidden' else 'active' end from public.recipes x where x.id=r.target_id) when 'review' then (select x.moderation_status from public.recipe_reviews x where x.id=r.target_id) when 'post' then (select case when x.is_hidden then 'hidden' else 'active' end from public.photo_posts x where x.id=r.target_id) when 'post_comment' then (select case when x.deleted_at is not null then 'deleted' when x.is_hidden then 'hidden' else 'active' end from public.post_comments x where x.id=r.target_id) when 'message' then (select case when x.is_hidden then 'hidden' else 'active' end from public.direct_messages x where x.report_id=r.target_id) else case when exists(select 1 from public.profiles x where x.id=r.target_id) then 'active' else null end end,
   'actions',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]'::jsonb) from public.content_moderation_actions a where a.target_type=r.target_type and a.target_id=r.target_id)
  ) as item from public.content_reports r where (p_type='all' or r.target_type=p_type) and (p_status='all' or r.status=p_status) order by r.created_at desc,r.id limit 50 offset p_offset
 ) page;
 return jsonb_build_object('reports',result,'total',total,'has_more',p_offset+50<total);
end; $function$;


CREATE OR REPLACE FUNCTION operations_helpers.set_target(p_case uuid, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case;
 if c.target_type='user' then
  update public.profiles set moderation_hidden=(p_action<>'restore') where id=c.target_id;
 elsif c.target_type='post' then
  update public.photo_posts set is_hidden=(p_action<>'restore'),moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='post_comment' then
  update public.post_comments set is_hidden=(p_action<>'restore'),moderation_removed=(p_action='remove') where id=c.target_id and deleted_at is null;
 elsif c.target_type='message' then
  update public.direct_messages set is_hidden=(p_action<>'restore'),moderation_removed=(p_action='remove') where report_id=c.target_id;
 elsif c.target_type='recipe' then
  update public.recipes set is_hidden=(p_action<>'restore'),moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='review' then
  update public.recipe_reviews set moderation_status=case when p_action='restore' then 'active' else 'hidden' end,moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='comment' then
  update public.recipe_comments set moderation_status=case p_action when 'restore' then 'active' when 'remove' then 'removed' else 'hidden' end where id=c.target_id;
 end if;
end; $function$;


CREATE OR REPLACE FUNCTION operations_helpers.target_active(p_case uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case c.target_type when 'recipe' then exists(select 1 from public.recipes r where r.id=c.target_id and not r.is_hidden)
when 'review' then exists(select 1 from public.recipe_reviews r where r.id=c.target_id and r.moderation_status='active')
when 'comment' then exists(select 1 from public.recipe_comments r where r.id=c.target_id and r.moderation_status='active') when 'user' then exists(select 1 from public.profiles p where p.id=c.target_id and not p.moderation_hidden) when 'post' then exists(select 1 from public.photo_posts p where p.id=c.target_id and not p.is_hidden and not p.moderation_removed)
 when 'post_comment' then exists(select 1 from public.post_comments p where p.id=c.target_id and not p.is_hidden and not p.moderation_removed and p.deleted_at is null)
 when 'message' then exists(select 1 from public.direct_messages p where p.report_id=c.target_id and not p.is_hidden and not p.moderation_removed)
 else false end
from public.moderation_cases c where c.id=p_case;
$function$;


CREATE OR REPLACE FUNCTION operations_helpers.apply_decision(p_decision uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.moderation_decisions; c public.moderation_cases; finish timestamptz; message text; target_title text; target_label text;
begin
 perform operations_helpers.require_admin();
 select * into d from public.moderation_decisions where id=p_decision for update;
 select * into c from public.moderation_cases where id=d.case_id for update;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||coalesce(d.subject_id::text,''),0));
 perform pg_advisory_xact_lock(hashtextextended(c.target_type||':'||c.target_id::text,0));
 -- A final finding supersedes only provisional sanctions from this incident.
 if d.state<>'temporary' then
 update public.account_sanctions s set revoked_at=now(),revoked_by=auth.uid()
 from public.moderation_decisions old where old.id=s.decision_id and old.case_id=c.id and old.state='temporary' and s.revoked_at is null;
 end if;
 if d.outcome in('hide','remove','temporary_hide') then
  if d.outcome='temporary_hide' and operations_helpers.target_active(c.id) then update public.moderation_cases set temporary_hidden=true where id=c.id; end if;
  perform operations_helpers.set_target(c.id,case when d.outcome='remove' then 'remove' else 'hide' end);
 elsif d.outcome='dismiss' and c.temporary_hidden and not exists(select 1 from public.moderation_decisions x join public.moderation_cases other on other.id=x.case_id where other.target_type=c.target_type and other.target_id=c.target_id and x.case_id<>c.id and x.state='confirmed' and x.outcome in('hide','remove')) then
  perform operations_helpers.set_target(c.id,'restore');
 end if;
 if d.sanction not in('none','warning') and d.subject_id is not null then
  finish:=case d.sanction when 'restrict_3' then now()+interval '3 days' when 'suspend_7' then now()+interval '7 days' when 'suspend_30' then now()+interval '30 days' when 'temp_suspend' then now()+interval '24 hours' when 'report_limit_7' then now()+interval '7 days' else null end;
  insert into public.account_sanctions(decision_id,user_id,kind,ends_at) values(d.id,d.subject_id,d.sanction,finish);
 end if;
 update public.moderation_decisions set notified_at=now(),updated_at=clock_timestamp() where id=d.id;
 if d.state='temporary' then
  update public.moderation_cases set status=case when d.outcome='request_info' then 'needs_info' else 'reviewing' end,first_response_at=coalesce(first_response_at,now()),updated_at=clock_timestamp() where id=c.id;
 else
  update public.content_reports set status=case when d.outcome='dismiss' then 'dismissed' else 'actioned' end,reviewed_at=now(),reviewed_by=auth.uid(),resolution_note=d.internal_note where target_type=c.target_type and target_id=c.target_id and status='open';
  if c.target_type='comment' then update public.comment_reports set status=case when d.outcome='dismiss' then 'dismissed' else 'actioned' end,reviewed_at=now(),reviewed_by=auth.uid(),resolution_note=d.internal_note where comment_id=c.target_id and status='open'; end if;
  update public.moderation_cases set status='closed',updated_at=clock_timestamp() where id=c.id;
 end if;
 target_title:=case c.target_type
 when 'recipe' then (select title from public.recipes where id=c.target_id)
 when 'review' then (select r.title from public.recipe_reviews v join public.recipes r on r.id=v.recipe_id where v.id=c.target_id)
 when 'comment' then (select r.title from public.recipe_comments v join public.recipes r on r.id=v.recipe_id where v.id=c.target_id)
 else null end;
 target_label:=case when c.target_type='user' then 'Your account' else 'Your '||case c.target_type when 'post' then 'photo post' when 'post_comment' then 'photo-post comment' else c.target_type end||case when target_title is not null then ' on "'||left(target_title,200)||'"' else '' end end;
 message:=target_label||'. '||case when d.state='temporary' then 'A report is being reviewed. Provisional action: ' when d.outcome='dismiss' then 'A report about your content was reviewed; a violation was not confirmed. Action: ' else 'A policy violation was confirmed. Content action: ' end||d.outcome||'. Account action: '||d.sanction||'.'
 ||case when finish is not null then ' Restriction ends: '||to_char(finish at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.' when d.sanction='permanent' then ' The suspension has no automatic end date.' else '' end;
 perform operations_helpers.notice(d.id,d.subject_id,case when c.target_type='user' then 'account' else c.target_type end,d.outcome,'Clause: '||d.clause||'. '||d.public_reason,message,c.id,true);
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'decision:'||d.outcome||':'||d.sanction,d.internal_note);
 return (select to_jsonb(x) from public.moderation_decisions x where id=d.id);
end; $function$;


CREATE OR REPLACE FUNCTION post_helpers.public_post(p_post uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.photo_posts p join public.profiles a on a.id=p.author_id where p.id=p_post and p.status='published' and not p.is_hidden and not p.moderation_removed
 and not a.moderation_hidden and guardian_helpers.public_allowed(a.id) and not blocking_helpers.viewer_blocked(p.author_id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=p.author_id));
$function$;


CREATE OR REPLACE FUNCTION post_helpers.visible(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.photo_posts p join public.profiles a on a.id=p.author_id
 where p.id=p_id and (p.author_id=auth.uid() or private.is_admin() or
 (p.status='published' and not p.is_hidden and not p.moderation_removed and not a.moderation_hidden and guardian_helpers.public_allowed(a.id) and not blocking_helpers.viewer_blocked(p.author_id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=p.author_id))));
$function$;


CREATE OR REPLACE FUNCTION post_helpers.comment_visible(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.post_comments c join public.profiles a on a.id=c.user_id
 where c.id=p_id and not c.is_hidden and not c.moderation_removed and post_helpers.public_post(c.post_id) and guardian_helpers.public_allowed(a.id)
 and not a.moderation_hidden and not blocking_helpers.viewer_blocked(a.id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=a.id)
 and (c.parent_id is null or exists(select 1 from public.post_comments root join public.profiles ra on ra.id=root.user_id
 where root.id=c.parent_id and not root.is_hidden and not root.moderation_removed and root.post_id=c.post_id and root.parent_id is null
 and not ra.moderation_hidden and guardian_helpers.public_allowed(ra.id) and not blocking_helpers.viewer_blocked(ra.id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=ra.id))));
$function$;


CREATE OR REPLACE FUNCTION push_helpers.allowed(p_job uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  select * into m from public.direct_messages where id=j.message_id and recipient_id=j.recipient_id and read_at is null and not is_hidden and not moderation_removed;
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
end$function$;


CREATE OR REPLACE FUNCTION operations_helpers.case_context(p_case uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.moderation_cases; rid uuid; target jsonb; recipe jsonb;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case;
 if not found then raise exception 'Case unavailable' using errcode='P0002'; end if;
 if c.evidence_deleted_at is not null or (c.status='closed' and c.evidence_expires_at<=now() and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=c.id and a.status='open')) then raise exception 'Detailed case context expired' using errcode='42501'; end if;
 if c.target_type='recipe' then rid:=c.target_id;
 elsif c.target_type='post' then select jsonb_build_object('id',p.id,'content',p.caption,'hidden',p.is_hidden,'removed',p.moderation_removed) into target from public.photo_posts p where p.id=c.target_id;
 elsif c.target_type='post_comment' then select jsonb_build_object('id',p.id,'content',p.content,'post_id',p.post_id,'parent_id',p.parent_id,'hidden',p.is_hidden,'deleted',p.deleted_at is not null) into target from public.post_comments p where p.id=c.target_id;
 elsif c.target_type='message' then select jsonb_build_object('id',m.report_id,'content',m.body,'sent_at',m.created_at,'hidden',m.is_hidden,'removed',m.moderation_removed) into target from public.direct_messages m where m.report_id=c.target_id;
 elsif c.target_type='review' then select recipe_id,to_jsonb(v) into rid,target from public.recipe_reviews v where id=c.target_id;
 elsif c.target_type='comment' then select recipe_id,to_jsonb(v) into rid,target from public.recipe_comments v where id=c.target_id;
 else select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio) into target from public.profiles p where id=c.target_id; end if;
 if rid is not null then
 select jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'short_description',r.short_description,'cover_image',r.cover_image,'ingredients_image',r.ingredients_image,'video_url',r.video_url,'is_hidden',r.is_hidden,'removed',r.moderation_removed,
 'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.step_number),'[]') from public.recipe_steps s where s.recipe_id=r.id),
 'ingredients',(select coalesce(jsonb_agg(jsonb_build_object('name',i.name,'amount',ri.amount,'unit',ri.unit,'substitute',ri.substitute) order by ri.display_order),'[]') from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id where ri.recipe_id=r.id)) into recipe from public.recipes r where r.id=rid;
 end if;
 return jsonb_build_object('case_id',c.id,'type',c.target_type,'target',target,'recipe',recipe,'images',coalesce((select jsonb_agg(distinct img) from (
 select jsonb_array_elements_text(r.snapshot->'images') img from public.content_reports r join public.moderation_case_reports l on l.source='content' and l.report_id=r.id where l.case_id=c.id and jsonb_typeof(r.snapshot->'images')='array'
 union select r.snapshot->>'image' from public.content_reports r join public.moderation_case_reports l on l.source='content' and l.report_id=r.id where l.case_id=c.id and r.snapshot->>'image' is not null
 ) images where img like 'community:%' or img like 'chat:%'),'[]'::jsonb));
end; $function$;


CREATE OR REPLACE FUNCTION engagement_helpers.response_available(p_comment uuid, p_recipient uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.post_comments c join public.profiles a on a.id=c.user_id
 where c.id=p_comment and c.deleted_at is null and not c.is_hidden and not c.moderation_removed and not a.moderation_hidden and guardian_helpers.public_allowed(a.id)
 and not exists(select 1 from public.user_blocks ub where (ub.blocker_id=a.id and ub.blocked_id=p_recipient) or (ub.blocked_id=a.id and ub.blocker_id=p_recipient))
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=a.id)
 and (c.parent_id is null or exists(select 1 from public.post_comments root join public.profiles ra on ra.id=root.user_id
 where root.id=c.parent_id and root.post_id=c.post_id and not root.is_hidden and not root.moderation_removed and not ra.moderation_hidden and guardian_helpers.public_allowed(ra.id)
 and not exists(select 1 from public.user_blocks ub where (ub.blocker_id=ra.id and ub.blocked_id=p_recipient) or (ub.blocked_id=ra.id and ub.blocker_id=p_recipient))
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=ra.id))));
$function$;

notify pgrst,'reload schema';
