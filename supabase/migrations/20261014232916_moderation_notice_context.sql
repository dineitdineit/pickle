create or replace function operations_helpers.apply_decision(p_decision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
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
 if d.outcome in('hide','remove','temporary_hide') and c.target_type<>'user' then
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
 target_label:=case when c.target_type='user' then 'Your account' else 'Your '||c.target_type||case when target_title is not null then ' on "'||left(target_title,200)||'"' else '' end end;
 message:=target_label||'. '||case when d.state='temporary' then 'A report is being reviewed. Provisional action: ' when d.outcome='dismiss' then 'A report about your content was reviewed; a violation was not confirmed. Action: ' else 'A policy violation was confirmed. Content action: ' end||d.outcome||'. Account action: '||d.sanction||'.'
 ||case when finish is not null then ' Restriction ends: '||to_char(finish at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.' when d.sanction='permanent' then ' The suspension has no automatic end date.' else '' end;
 perform operations_helpers.notice(d.id,d.subject_id,'account',d.outcome,'Clause: '||d.clause||'. '||d.public_reason,message,c.id,true);
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'decision:'||d.outcome||':'||d.sanction,d.internal_note);
 return (select to_jsonb(x) from public.moderation_decisions x where id=d.id);
end; $$;

create or replace function operations_helpers.my_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 return jsonb_build_object('user_id',uid,
 'can_publish',operations_helpers.can_act('publish'),'can_message',operations_helpers.can_act('message'),'can_social',operations_helpers.can_act('social'),'can_report',operations_helpers.can_act('report'),
 'restrictions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'starts_at',starts_at,'ends_at',ends_at) order by starts_at desc),'[]') from public.account_sanctions where user_id=uid and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now())),
 'decisions',(select coalesce(jsonb_agg(row order by notified_at desc,id),'[]') from (
 select d.id,d.case_id,d.outcome,d.clause,d.public_reason,d.sanction,d.state,d.notified_at,
 c.target_type,c.target_id,case c.target_type when 'recipe' then (select title from public.recipes where id=c.target_id) when 'review' then (select r.title from public.recipe_reviews v join public.recipes r on r.id=v.recipe_id where v.id=c.target_id) when 'comment' then (select r.title from public.recipe_comments v join public.recipes r on r.id=v.recipe_id where v.id=c.target_id) else 'Your account' end as target_title,
 (select jsonb_build_object('id',a.id,'status',a.status,'explanation',a.explanation,'response',a.response,'created_at',a.created_at,'reviewed_at',a.reviewed_at) from public.moderation_appeals a where a.decision_id=d.id) as appeal,
 (d.state in('confirmed','temporary') and d.notified_at is not null and now()<=d.notified_at+interval '14 days' and not exists(select 1 from public.moderation_appeals a where a.decision_id=d.id)) as can_appeal
 from public.moderation_decisions d join public.moderation_cases c on c.id=d.case_id where d.subject_id=uid and d.notified_at is not null and d.state<>'proposed' order by d.notified_at desc,d.id limit 100
 ) row));
end; $$;

create or replace function operations_helpers.can_act(p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_action in('publish','message','social','profile','content_upload','draft','report') and exists(select 1 from public.profiles where id=auth.uid()) and auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and not exists(select 1 from public.account_sanctions s where s.user_id=auth.uid() and s.revoked_at is null and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and (
 (s.kind='report_limit_7' and p_action='report') or
 (s.kind='restrict_3' and p_action in('publish','message','content_upload')) or
 (s.kind in('suspend_7','suspend_30','permanent','temp_suspend') and p_action in('publish','message','social','profile','content_upload','draft'))
 ));
$$;

