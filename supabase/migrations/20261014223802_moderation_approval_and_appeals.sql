create function operations_helpers.approve(p_decision uuid,p_expected timestamptz,p_approve boolean,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions; c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 if not operations_helpers.responsible() then raise exception 'Final responsible operator required' using errcode='42501'; end if;
 select * into d from public.moderation_decisions where id=p_decision;
 select * into c from public.moderation_cases where id=d.case_id for update;
 select * into d from public.moderation_decisions where id=p_decision for update;
 if not found or d.state<>'proposed' or d.updated_at is distinct from p_expected or c.status<>'proposed' then raise exception 'Proposal changed; reload' using errcode='40001'; end if;
 if c.subject_id=auth.uid() or exists(select 1 from public.moderation_case_reports where case_id=c.id and reporter_id=auth.uid()) then raise exception 'Conflict of interest' using errcode='42501'; end if;
 if p_approve is null or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'A separate final review note is required' using errcode='22023'; end if;
 -- A single operator can approve after a distinct review step; the two steps are audited.
 update public.moderation_decisions set state=case when p_approve then 'confirmed' else 'rejected' end,approved_by=auth.uid(),approval_note=btrim(p_note),updated_at=clock_timestamp() where id=d.id;
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),case when p_approve then 'final_approval' else 'proposal_rejected' end,btrim(p_note));
 if p_approve then return operations_helpers.apply_decision(d.id); end if;
 update public.moderation_cases set status='reviewing',updated_at=clock_timestamp() where id=c.id;
 return (select to_jsonb(x) from public.moderation_decisions x where id=d.id);
end; $$;
revoke all on function operations_helpers.approve(uuid,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function operations_helpers.approve(uuid,timestamptz,boolean,text) to authenticated;
create function public.approve_moderation_decision(p_decision uuid,p_expected timestamptz,p_approve boolean,p_note text) returns jsonb language sql security invoker set search_path='' as $$ select operations_helpers.approve(p_decision,p_expected,p_approve,p_note); $$;
revoke all on function public.approve_moderation_decision(uuid,timestamptz,boolean,text) from public,anon,authenticated;
grant execute on function public.approve_moderation_decision(uuid,timestamptz,boolean,text) to authenticated;

create function operations_helpers.appeal(p_decision uuid,p_explanation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions; a public.moderation_appeals; uid uuid:=auth.uid();
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into d from public.moderation_decisions where id=p_decision for update;
 if not found or d.subject_id is distinct from uid then raise exception 'Your own decision required' using errcode='42501'; end if;
 if d.state not in('confirmed','temporary') or d.notified_at is null or now()>d.notified_at+interval '14 days' then raise exception 'Appeal window closed' using errcode='22023'; end if;
 if char_length(btrim(coalesce(p_explanation,''))) not between 20 and 2000 then raise exception 'Explain your appeal in 20 to 2000 characters' using errcode='22023'; end if;
 insert into public.moderation_appeals(decision_id,user_id,explanation,due_at) values(d.id,uid,btrim(p_explanation),operations_helpers.business_due(now(),7)) on conflict(decision_id) do nothing;
 select * into a from public.moderation_appeals where decision_id=d.id;
 return jsonb_build_object('id',a.id,'decision_id',a.decision_id,'status',a.status,'explanation',a.explanation);
end; $$;
revoke all on function operations_helpers.appeal(uuid,text) from public,anon,authenticated;
grant execute on function operations_helpers.appeal(uuid,text) to authenticated;
create function public.submit_moderation_appeal(p_decision uuid,p_explanation text) returns jsonb language sql security invoker set search_path='' as $$ select operations_helpers.appeal(p_decision,p_explanation); $$;
revoke all on function public.submit_moderation_appeal(uuid,text) from public,anon,authenticated;
grant execute on function public.submit_moderation_appeal(uuid,text) to authenticated;

create function operations_helpers.overturn(p_decision uuid,p_response text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions; c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into d from public.moderation_decisions where id=p_decision;
 select * into c from public.moderation_cases where id=d.case_id for update;
 select * into d from public.moderation_decisions where id=p_decision for update;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||coalesce(d.subject_id::text,''),0));
 if not found or d.state not in('confirmed','temporary') then raise exception 'Decision already reversed or unavailable' using errcode='40001'; end if;
 update public.moderation_decisions set state='overturned',updated_at=clock_timestamp() where id=d.id;
 update public.account_sanctions set revoked_at=now(),revoked_by=auth.uid() where decision_id=d.id and revoked_at is null;
 -- Never undo a different standing content violation.
 if not exists(select 1 from public.moderation_decisions other join public.moderation_cases oc on oc.id=other.case_id where oc.target_type=c.target_type and oc.target_id=c.target_id and other.id<>d.id and other.state='confirmed' and other.outcome in('hide','remove')) then
  if d.outcome in('hide','remove','temporary_hide') then perform operations_helpers.set_target(c.id,'restore'); end if;
 end if;
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'overturned',btrim(p_note));
 perform operations_helpers.notice(gen_random_uuid(),d.subject_id,'appeal','overturned',p_response,'The reviewed decision was overturned. Its account restriction and violation count were cancelled; content was restored unless another decision still applies.',c.id,true);
end; $$;
revoke all on function operations_helpers.overturn(uuid,text,text) from public,anon,authenticated;
create function operations_helpers.review_appeal(p_appeal uuid,p_result text,p_response text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.moderation_appeals; d public.moderation_decisions; c public.moderation_cases; another boolean;
begin
 perform operations_helpers.require_admin();
 select * into a from public.moderation_appeals where id=p_appeal;
 select * into d from public.moderation_decisions where id=a.decision_id;
 select * into c from public.moderation_cases where id=d.case_id for update;
 select * into d from public.moderation_decisions where id=a.decision_id for update;
 select * into a from public.moderation_appeals where id=p_appeal for update;
 if not found or a.status<>'open' then raise exception 'Appeal already reviewed' using errcode='40001'; end if;
 if p_result is null or p_result not in('upheld','overturned') or char_length(btrim(coalesce(p_response,''))) not between 10 and 1000 or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'Outcome, public explanation and internal review note required' using errcode='22023'; end if;
 if a.user_id=auth.uid() or exists(select 1 from public.moderation_case_reports where case_id=c.id and reporter_id=auth.uid()) then raise exception 'Conflict of interest' using errcode='42501'; end if;
 select exists(select 1 from public.profiles p where p.role in('admin','official') and p.id<>d.proposed_by and p.id<>a.user_id and not exists(select 1 from public.moderation_case_reports m where m.case_id=c.id and m.reporter_id=p.id)) into another;
 if auth.uid()=d.proposed_by and another then raise exception 'An uninvolved reviewer must handle this appeal' using errcode='42501'; end if;
 if d.sanction in('permanent','suspend_30','suspend_7') and not operations_helpers.responsible() then raise exception 'Final responsible operator required for long sanctions' using errcode='42501'; end if;
 if p_result='overturned' then perform operations_helpers.overturn(d.id,p_response,p_note);
 else
  insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'appeal_upheld',btrim(p_note));
  perform operations_helpers.notice(gen_random_uuid(),a.user_id,'appeal','upheld',p_response,'Your appeal was reviewed. The original decision remains in effect.',c.id,true);
 end if;
 update public.moderation_appeals set status=p_result,response=btrim(p_response),internal_note=btrim(p_note),reviewed_by=auth.uid(),reviewed_at=now() where id=a.id;
 return jsonb_build_object('id',a.id,'status',p_result,'response',btrim(p_response));
end; $$;
revoke all on function operations_helpers.review_appeal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function operations_helpers.review_appeal(uuid,text,text,text) to authenticated;
create function public.review_moderation_appeal(p_appeal uuid,p_result text,p_response text,p_note text) returns jsonb language sql security invoker set search_path='' as $$ select operations_helpers.review_appeal(p_appeal,p_result,p_response,p_note); $$;
revoke all on function public.review_moderation_appeal(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.review_moderation_appeal(uuid,text,text,text) to authenticated;

create function operations_helpers.revoke(p_decision uuid,p_reason text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions;
begin
 perform operations_helpers.require_admin();
 if not operations_helpers.responsible() then raise exception 'Responsible operator required' using errcode='42501'; end if;
 select * into d from public.moderation_decisions where id=p_decision;
 if d.subject_id=auth.uid() or exists(select 1 from public.moderation_case_reports where case_id=d.case_id and reporter_id=auth.uid()) then raise exception 'Conflict of interest' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 10 and 1000 or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'Public explanation and review note required' using errcode='22023'; end if;
 perform operations_helpers.overturn(p_decision,p_reason,p_note);
 return (select to_jsonb(x) from public.moderation_decisions x where id=p_decision);
end; $$;
revoke all on function operations_helpers.revoke(uuid,text,text) from public,anon,authenticated;
grant execute on function operations_helpers.revoke(uuid,text,text) to authenticated;
create function public.revoke_moderation_decision(p_decision uuid,p_reason text,p_note text) returns jsonb language sql security invoker set search_path='' as $$ select operations_helpers.revoke(p_decision,p_reason,p_note); $$;
revoke all on function public.revoke_moderation_decision(uuid,text,text) from public,anon,authenticated;
grant execute on function public.revoke_moderation_decision(uuid,text,text) to authenticated;

