create function operations_helpers.set_target(p_case uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case;
 if c.target_type='recipe' then
  update public.recipes set is_hidden=(p_action<>'restore'),moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='review' then
  update public.recipe_reviews set moderation_status=case when p_action='restore' then 'active' else 'hidden' end,moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='comment' then
  update public.recipe_comments set moderation_status=case p_action when 'restore' then 'active' when 'remove' then 'removed' else 'hidden' end where id=c.target_id;
 end if;
end; $$;
revoke all on function operations_helpers.set_target(uuid,text) from public,anon,authenticated;
create function operations_helpers.target_active(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
select case c.target_type when 'recipe' then exists(select 1 from public.recipes r where r.id=c.target_id and not r.is_hidden)
when 'review' then exists(select 1 from public.recipe_reviews r where r.id=c.target_id and r.moderation_status='active')
when 'comment' then exists(select 1 from public.recipe_comments r where r.id=c.target_id and r.moderation_status='active') else false end
from public.moderation_cases c where c.id=p_case;
$$;
revoke all on function operations_helpers.target_active(uuid) from public,anon,authenticated;
create function operations_helpers.apply_decision(p_decision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions; c public.moderation_cases; finish timestamptz; message text;
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
 message:=case when d.state='temporary' then 'A report is being reviewed. Provisional action: ' when d.outcome='dismiss' then 'A report about your content was reviewed; a violation was not confirmed. Action: ' else 'A policy violation was confirmed. Content action: ' end||d.outcome||'. Account action: '||d.sanction||'.'
 ||case when finish is not null then ' Restriction ends: '||to_char(finish at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.' when d.sanction='permanent' then ' The suspension has no automatic end date.' else '' end;
 perform operations_helpers.notice(d.id,d.subject_id,'account',d.outcome,'Clause: '||d.clause||'. '||d.public_reason,message,c.id,true);
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'decision:'||d.outcome||':'||d.sanction,d.internal_note);
 return (select to_jsonb(x) from public.moderation_decisions x where id=d.id);
end; $$;
revoke all on function operations_helpers.apply_decision(uuid) from public,anon,authenticated;

create function operations_helpers.decide(p_case uuid,p_expected timestamptz,p_outcome text,p_severity text,p_clause text,p_reason text,p_note text,p_sanction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases; did uuid; prior bigint; state text;
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
 select count(*) into prior from public.moderation_decisions where subject_id=c.subject_id and case_id<>c.id and state='confirmed' and created_at>=now()-interval '90 days';
 if p_sanction='restrict_3' and prior<1 and p_severity<>'critical' then raise exception 'Repeat violation or critical risk required' using errcode='22023'; end if;
 if p_sanction in('suspend_7','suspend_30') and prior<2 and p_severity<>'critical' then raise exception 'Persistent repeat violation or critical risk required' using errcode='22023'; end if;
 if p_sanction='permanent' and p_severity<>'critical' and not(p_clause='evasion' and prior>=1) then raise exception 'Permanent suspension requires critical risk or proven repeated evasion' using errcode='22023'; end if;
 state:=case when p_sanction in('suspend_7','suspend_30','permanent') then 'proposed' when p_outcome in('request_info','temporary_hide') then 'temporary' when p_outcome='dismiss' then 'dismissed' else 'confirmed' end;
 insert into public.moderation_decisions(case_id,subject_id,outcome,severity,clause,public_reason,internal_note,sanction,state,proposed_by)
 values(c.id,c.subject_id,p_outcome,p_severity,p_clause,btrim(p_reason),btrim(p_note),p_sanction,state,auth.uid()) returning id into did;
 if state='proposed' then
  update public.moderation_cases set status='proposed',updated_at=clock_timestamp() where id=c.id;
  insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'proposal',btrim(p_note));
  return (select to_jsonb(x) from public.moderation_decisions x where id=did);
 end if;
 return operations_helpers.apply_decision(did);
end; $$;
revoke all on function operations_helpers.decide(uuid,timestamptz,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function operations_helpers.decide(uuid,timestamptz,text,text,text,text,text,text) to authenticated;
create function public.decide_moderation_case(p_case uuid,p_expected timestamptz,p_outcome text,p_severity text,p_clause text,p_reason text,p_note text,p_sanction text) returns jsonb
language sql security invoker set search_path='' as $$ select operations_helpers.decide(p_case,p_expected,p_outcome,p_severity,p_clause,p_reason,p_note,p_sanction); $$;
revoke all on function public.decide_moderation_case(uuid,timestamptz,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.decide_moderation_case(uuid,timestamptz,text,text,text,text,text,text) to authenticated;

