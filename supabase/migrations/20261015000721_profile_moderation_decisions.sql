create or replace function operations_helpers.decide(p_case uuid,p_expected timestamptz,p_outcome text,p_severity text,p_clause text,p_reason text,p_note text,p_sanction text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases; did uuid; provisional_id uuid; prior bigint; decision_state text;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case for update;
 if not found or c.updated_at is distinct from p_expected or c.status in('closed','proposed') then raise exception 'Case changed; reload' using errcode='40001'; end if;
 if c.assignee_id is distinct from auth.uid() or c.subject_id=auth.uid() or exists(select 1 from public.moderation_case_reports where case_id=c.id and reporter_id=auth.uid()) then raise exception 'Assigned uninvolved reviewer required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in('dismiss','request_changes','hide','remove','temporary_hide','request_info') or p_severity is null or p_severity not in('minor','standard','repeated','critical') or p_clause is null or p_clause not in('harassment','sexual_exploitation','privacy','scam_spam','copyright_impersonation','dangerous_content','rating_manipulation','evasion','false_reports','none') or p_sanction is null or p_sanction not in('none','warning','restrict_3','suspend_7','suspend_30','permanent','temp_suspend','report_limit_7') or char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000 or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'Decision, clause, public reason and evidence note required' using errcode='22023'; end if;
 
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
  if p_severity='critical' then
   insert into public.moderation_decisions(case_id,subject_id,outcome,severity,clause,public_reason,internal_note,sanction,state,proposed_by)
   values(c.id,c.subject_id,case when c.target_type='user' and p_outcome not in('hide','remove','temporary_hide') then 'request_info' else 'temporary_hide' end,'critical',p_clause,btrim(p_reason),btrim(p_note),'temp_suspend','temporary',auth.uid()) returning id into provisional_id;
   perform operations_helpers.apply_decision(provisional_id);
  end if;
  update public.moderation_cases set status='proposed',updated_at=clock_timestamp() where id=c.id;
  insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'proposal',btrim(p_note));
  return (select to_jsonb(x) from public.moderation_decisions x where id=did);
 end if;
 return operations_helpers.apply_decision(did);
end; $$;




