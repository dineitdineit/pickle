create or replace function operations_helpers.intake() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; kind text; target uuid; source_kind text;
begin
 if tg_table_name='comment_reports' then kind:='comment';target:=new.comment_id;source_kind:='comment';
 else kind:=new.target_type;target:=new.target_id;source_kind:='content'; end if;
 if tg_op='INSERT' then
  if new.status='open' then perform operations_helpers.attach_report(source_kind,new.id,kind,target,new.reported_user_id,new.reporter_id,new.reason,new.created_at); end if;
 elsif new.status<>'open' and old.status='open' then
  select case_id into cid from public.moderation_case_reports where report_id=new.id and moderation_case_reports.source=source_kind;
  if cid is not null and not exists(select 1 from public.moderation_case_reports m where m.case_id=cid and
    ((m.source='content' and exists(select 1 from public.content_reports r where r.id=m.report_id and r.status='open')) or (m.source='comment' and exists(select 1 from public.comment_reports r where r.id=m.report_id and r.status='open')))) then
    update public.moderation_cases set status='closed',updated_at=clock_timestamp() where id=cid;
    insert into public.moderation_case_events(case_id,actor_id,action,note) values(cid,auth.uid(),'report_closed','Related reports processed; no automatic account strike.');
    -- Reporters see only completion, never the target user's restrictions or memo.
    insert into public.user_notifications(recipient_id,actor_id,kind,moderation_event_id,moderation_details)
    select distinct m.reporter_id,null,'moderation',gen_random_uuid(),jsonb_build_object('type','report_result','action',new.status,'message',case when new.status='dismissed' then 'Your report was reviewed. A policy violation was not confirmed.' else 'Your report was reviewed and appropriate action was taken.' end)
    from public.moderation_case_reports m where m.case_id=cid and m.reporter_id is not null;
  end if;
 end if;
 return new;
end; $$;

create or replace function operations_helpers.decide(p_case uuid,p_expected timestamptz,p_outcome text,p_severity text,p_clause text,p_reason text,p_note text,p_sanction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases; did uuid; prior bigint; decision_state text;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case for update;
 if not found or c.updated_at is distinct from p_expected or c.status in('closed','proposed') then raise exception 'Case changed; reload' using errcode='40001'; end if;
 if c.assignee_id is distinct from auth.uid() or c.subject_id=auth.uid() or exists(select 1 from public.moderation_case_reports where case_id=c.id and reporter_id=auth.uid()) then raise exception 'Assigned uninvolved reviewer required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in('dismiss','request_changes','hide','remove','temporary_hide','request_info') or p_severity is null or p_severity not in('minor','standard','repeated','critical') or p_clause is null or p_clause not in('harassment','sexual_exploitation','privacy','scam_spam','copyright_impersonation','dangerous_content','rating_manipulation','evasion','false_reports','none') or p_sanction is null or p_sanction not in('none','warning','restrict_3','suspend_7','suspend_30','permanent','temp_suspend','report_limit_7') or char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000 or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'Decision, clause, public reason and evidence note required' using errcode='22023'; end if;
 if c.target_type='user' and p_outcome in('hide','remove','temporary_hide') then raise exception 'Choose a user account action, not content deletion' using errcode='22023'; end if;
 if p_outcome='dismiss' and p_sanction<>'none' then raise exception 'Dismissal cannot impose a sanction' using errcode='22023'; end if;
 if p_outcome in('request_info','temporary_hide') and p_sanction not in('none','temp_suspend') then raise exception 'Provisional action cannot count a confirmed violation' using errcode='22023'; end if;
 if p_sanction='temp_suspend' and (p_severity<>'critical' or p_outcome not in('request_info','temporary_hide')) then raise exception 'Urgent provisional suspension requires critical risk' using errcode='22023'; end if;
 if p_outcome not in('dismiss','request_info','temporary_hide') and p_clause='none' then raise exception 'Confirmed findings require a policy clause' using errcode='22023'; end if;
 if p_sanction='report_limit_7' and p_clause<>'false_reports' then raise exception 'Report restriction requires proven malicious false reports' using errcode='22023'; end if;
 select count(*) into prior from public.moderation_decisions where subject_id=c.subject_id and case_id<>c.id and state='confirmed' and coalesce(notified_at,created_at)>=now()-interval '90 days';
 if p_sanction='restrict_3' and prior<1 and p_severity<>'critical' then raise exception 'Repeat violation or critical risk required' using errcode='22023'; end if;
 if p_sanction in('suspend_7','suspend_30') and prior<2 and p_severity<>'critical' then raise exception 'Persistent repeat violation or critical risk required' using errcode='22023'; end if;
 if p_sanction='permanent' and p_severity<>'critical' and not(p_clause='evasion' and prior>=1) then raise exception 'Permanent suspension requires critical risk or proven repeated evasion' using errcode='22023'; end if;
 decision_state:=case when p_sanction in('suspend_7','suspend_30','permanent') then 'proposed' when p_outcome in('request_info','temporary_hide') then 'temporary' when p_outcome='dismiss' then 'dismissed' else 'confirmed' end;
 insert into public.moderation_decisions(case_id,subject_id,outcome,severity,clause,public_reason,internal_note,sanction,state,proposed_by)
 values(c.id,c.subject_id,p_outcome,p_severity,p_clause,btrim(p_reason),btrim(p_note),p_sanction,decision_state,auth.uid()) returning id into did;
 if decision_state='proposed' then
  update public.moderation_cases set status='proposed',updated_at=clock_timestamp() where id=c.id;
  insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'proposal',btrim(p_note));
  return (select to_jsonb(x) from public.moderation_decisions x where id=did);
 end if;
 return operations_helpers.apply_decision(did);
end; $$;

create or replace function operations_helpers.overturn(p_decision uuid,p_response text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions; c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into d from public.moderation_decisions where id=p_decision;
 select * into c from public.moderation_cases where id=d.case_id for update;
 select * into d from public.moderation_decisions where id=p_decision for update;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||coalesce(d.subject_id::text,''),0));
 if d.id is null or d.state not in('confirmed','temporary') then raise exception 'Decision already reversed or unavailable' using errcode='40001'; end if;
 update public.moderation_decisions set state='overturned',updated_at=clock_timestamp() where id=d.id;
 update public.account_sanctions set revoked_at=now(),revoked_by=auth.uid() where decision_id=d.id and revoked_at is null;
 -- Never undo a different standing content violation.
 if not exists(select 1 from public.moderation_decisions other join public.moderation_cases oc on oc.id=other.case_id where oc.target_type=c.target_type and oc.target_id=c.target_id and other.id<>d.id and other.state='confirmed' and other.outcome in('hide','remove')) then
  if d.outcome in('hide','remove','temporary_hide') then perform operations_helpers.set_target(c.id,'restore'); end if;
 end if;
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'overturned',btrim(p_note));
 perform operations_helpers.notice(gen_random_uuid(),d.subject_id,'appeal','overturned',p_response,'The reviewed decision was overturned. Its account restriction and violation count were cancelled; content was restored unless another decision still applies.',c.id,true);
end; $$;

create or replace function blocking_helpers.safety_version() returns text
language plpgsql stable security definer set search_path='' as $$
declare blocks text; sanctions text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in required' using errcode='42501'; end if;
 select coalesce(string_agg(blocker_id::text||':'||blocked_id::text||':'||created_at::text,',' order by blocker_id,blocked_id),'') into blocks from public.user_blocks where blocker_id=auth.uid() or blocked_id=auth.uid();
 select coalesce(string_agg(id::text||':'||coalesce(revoked_at::text,'')||':'||coalesce((ends_at>now())::text,'permanent'),',' order by id),'') into sanctions from public.account_sanctions where user_id=auth.uid();
 return md5(blocks||'|'||sanctions);
end; $$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
select not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in('admin','official'))
and not exists(select 1 from public.account_sanctions where user_id=auth.uid() and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now()) and kind in('suspend_7','suspend_30','permanent','temp_suspend'));
$$;

