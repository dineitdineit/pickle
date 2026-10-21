create or replace function operations_helpers.attach_report(p_source text,p_report uuid,p_type text,p_target uuid,p_subject uuid,p_reporter uuid,p_reason text,p_created timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; report_priority text:=case when p_reason in('sexual_content','personal_information') then 'urgent' when p_reason in('harassment','hate_or_abusive') then 'high' else 'normal' end;
begin
 perform pg_advisory_xact_lock(hashtextextended('case:'||p_type||':'||p_target::text,0));
 select id into cid from public.moderation_cases where target_type=p_type and target_id=p_target and status<>'closed';
 if cid is null then
  insert into public.moderation_cases(target_type,target_id,subject_id,priority,created_at,due_at)
  values(p_type,p_target,p_subject,report_priority,p_created,case when report_priority in('urgent','high') then p_created+interval '24 hours' else operations_helpers.business_due(p_created,3) end) returning id into cid;
 else
  update public.moderation_cases set priority=report_priority,updated_at=clock_timestamp(),due_at=least(due_at,created_at+interval '24 hours')
  where id=cid and report_priority in('urgent','high') and (moderation_cases.priority in('normal','needs_info') or (report_priority='urgent' and moderation_cases.priority='high'));
 end if;
 insert into public.moderation_case_reports(case_id,source,report_id,reporter_id) values(cid,p_source,p_report,p_reporter) on conflict do nothing;
 return cid;
end; $$;

create or replace function operations_helpers.triage(p_case uuid,p_expected timestamptz,p_assignee uuid,p_priority text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case for update;
 if not found or c.updated_at is distinct from p_expected or c.status='closed' then raise exception 'Case changed; reload' using errcode='40001'; end if;
 if p_priority is null or p_priority not in('urgent','high','normal','needs_info') or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'Priority and review note required' using errcode='22023'; end if;
 if p_assignee is null or not exists(select 1 from public.profiles where id=p_assignee and role in('admin','official')) or exists(select 1 from public.account_sanctions where user_id=p_assignee and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now()) and kind in('suspend_7','suspend_30','permanent','temp_suspend')) or p_assignee=c.subject_id or exists(select 1 from public.moderation_case_reports where case_id=c.id and reporter_id=p_assignee) then raise exception 'Assign an uninvolved administrator' using errcode='42501'; end if;
 update public.moderation_cases set assignee_id=p_assignee,priority=p_priority,status=case when p_priority='needs_info' then 'needs_info' else 'reviewing' end,
 first_response_at=coalesce(first_response_at,now()),due_at=case when p_priority in('urgent','high') then c.created_at+interval '24 hours' else operations_helpers.business_due(c.created_at,3) end,updated_at=clock_timestamp() where id=c.id;
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'triage',btrim(p_note));
 return (select to_jsonb(x) from public.moderation_cases x where id=c.id);
end; $$;

create or replace function operations_helpers.can_act(p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_action in('publish','message','social','profile','content_upload','draft','report') and auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and not exists(select 1 from public.account_sanctions s where s.user_id=auth.uid() and s.revoked_at is null and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and (
 (s.kind='report_limit_7' and p_action='report') or
 (s.kind='restrict_3' and p_action in('publish','message','content_upload')) or
 (s.kind in('suspend_7','suspend_30','permanent','temp_suspend') and p_action in('publish','message','social','profile','content_upload','draft'))
 ));
$$;

