create function operations_helpers.attach_report(p_source text,p_report uuid,p_type text,p_target uuid,p_subject uuid,p_reporter uuid,p_reason text,p_created timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare cid uuid; priority text:=case when p_reason in('sexual_content','personal_information') then 'urgent' when p_reason in('harassment','hate_or_abusive') then 'high' else 'normal' end;
begin
 perform pg_advisory_xact_lock(hashtextextended('case:'||p_type||':'||p_target::text,0));
 select id into cid from public.moderation_cases where target_type=p_type and target_id=p_target and status<>'closed';
 if cid is null then
  insert into public.moderation_cases(target_type,target_id,subject_id,priority,created_at,due_at)
  values(p_type,p_target,p_subject,priority,p_created,case when priority in('urgent','high') then p_created+interval '24 hours' else operations_helpers.business_due(p_created,3) end) returning id into cid;
 end if;
 insert into public.moderation_case_reports(case_id,source,report_id,reporter_id) values(cid,p_source,p_report,p_reporter) on conflict do nothing;
 return cid;
end; $$;
revoke all on function operations_helpers.attach_report(text,uuid,text,uuid,uuid,uuid,text,timestamptz) from public,anon,authenticated;
create function operations_helpers.intake() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid; kind text; target uuid; source text;
begin
 if tg_table_name='comment_reports' then kind:='comment';target:=new.comment_id;source:='comment';
 else kind:=new.target_type;target:=new.target_id;source:='content'; end if;
 if tg_op='INSERT' then
  if new.status='open' then perform operations_helpers.attach_report(source,new.id,kind,target,new.reported_user_id,new.reporter_id,new.reason,new.created_at); end if;
 elsif new.status<>'open' and old.status='open' then
  select case_id into cid from public.moderation_case_reports where report_id=new.id and moderation_case_reports.source=source;
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
revoke all on function operations_helpers.intake() from public,anon,authenticated;
create trigger moderation_case_content_intake after insert or update of status on public.content_reports for each row execute function operations_helpers.intake();
create trigger moderation_case_comment_intake after insert or update of status on public.comment_reports for each row execute function operations_helpers.intake();
-- Existing open reports enter the queue, with no adjudication or strikes.
do $$ declare r record; begin
 for r in select * from public.content_reports where status='open' loop perform operations_helpers.attach_report('content',r.id,r.target_type,r.target_id,r.reported_user_id,r.reporter_id,r.reason,r.created_at); end loop;
 for r in select * from public.comment_reports where status='open' loop perform operations_helpers.attach_report('comment',r.id,'comment',r.comment_id,r.reported_user_id,r.reporter_id,r.reason,r.created_at); end loop;
end; $$;

create function operations_helpers.workspace(p_status text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform operations_helpers.require_admin();
 if p_status not in('open','closed','all') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid filter' using errcode='22023'; end if;
 select jsonb_build_object(
 'can_approve',operations_helpers.responsible(),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',coalesce(display_name,username),'role',role) order by username),'[]') from public.profiles where role in('admin','official')),
 'cases',coalesce((select jsonb_agg(to_jsonb(row) order by row.due_at,row.id) from (
 select c.*,coalesce(p.display_name,p.username,'Deleted account') as subject_name,
 (select count(*) from public.moderation_decisions d where d.subject_id=c.subject_id and d.state='confirmed' and d.created_at>=now()-interval '90 days' and d.case_id<>c.id) as previous_violations,
 (select coalesce(jsonb_agg(jsonb_build_object('source',m.source,'id',m.report_id,'reason',case when m.source='content' then r.reason else cr.reason end,'details',case when m.source='content' then r.details else cr.details end,'snapshot',case when m.source='content' then r.snapshot else jsonb_build_object('content',cr.comment_snapshot) end)),'[]') from public.moderation_case_reports m left join public.content_reports r on m.source='content' and r.id=m.report_id left join public.comment_reports cr on m.source='comment' and cr.id=m.report_id where m.case_id=c.id) as reports,
 (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]') from public.moderation_decisions d where d.case_id=c.id) as decisions,
 (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]') from public.moderation_case_events e where e.case_id=c.id) as events
 from public.moderation_cases c left join public.profiles p on p.id=c.subject_id
 where p_status='all' or (p_status='closed' and c.status='closed') or (p_status='open' and c.status<>'closed')
 order by c.due_at,c.id limit 25 offset p_offset
 ) row),'[]'),
 'appeals',coalesce((select jsonb_agg(to_jsonb(a) order by a.due_at,a.id) from (select a.*,d.case_id,d.public_reason,d.sanction,coalesce(p.display_name,p.username) as user_name from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id left join public.profiles p on p.id=a.user_id where a.status='open' order by a.due_at,a.id limit 50) a),'[]'),
 'total',(select count(*) from public.moderation_cases c where p_status='all' or (p_status='closed' and c.status='closed') or (p_status='open' and c.status<>'closed'))
 ) into result;
 return result;
end; $$;
revoke all on function operations_helpers.workspace(text,integer) from public,anon,authenticated;
grant execute on function operations_helpers.workspace(text,integer) to authenticated;
create function public.get_moderation_workspace(p_status text default 'open',p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select operations_helpers.workspace(p_status,p_offset); $$;
revoke all on function public.get_moderation_workspace(text,integer) from public,anon,authenticated;
grant execute on function public.get_moderation_workspace(text,integer) to authenticated;

create function operations_helpers.triage(p_case uuid,p_expected timestamptz,p_assignee uuid,p_priority text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case for update;
 if not found or c.updated_at is distinct from p_expected or c.status='closed' then raise exception 'Case changed; reload' using errcode='40001'; end if;
 if p_priority is null or p_priority not in('urgent','high','normal','needs_info') or char_length(btrim(coalesce(p_note,''))) not between 10 and 2000 then raise exception 'Priority and review note required' using errcode='22023'; end if;
 if p_assignee is null or not exists(select 1 from public.profiles where id=p_assignee and role in('admin','official')) or p_assignee=c.subject_id or exists(select 1 from public.moderation_case_reports where case_id=c.id and reporter_id=p_assignee) then raise exception 'Assign an uninvolved administrator' using errcode='42501'; end if;
 update public.moderation_cases set assignee_id=p_assignee,priority=p_priority,status=case when p_priority='needs_info' then 'needs_info' else 'reviewing' end,
 first_response_at=coalesce(first_response_at,now()),due_at=case when p_priority in('urgent','high') then c.created_at+interval '24 hours' else operations_helpers.business_due(c.created_at,3) end,updated_at=clock_timestamp() where id=c.id;
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'triage',btrim(p_note));
 return (select to_jsonb(x) from public.moderation_cases x where id=c.id);
end; $$;
revoke all on function operations_helpers.triage(uuid,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function operations_helpers.triage(uuid,timestamptz,uuid,text,text) to authenticated;
create function public.triage_moderation_case(p_case uuid,p_expected timestamptz,p_assignee uuid,p_priority text,p_note text) returns jsonb language sql security invoker set search_path='' as $$ select operations_helpers.triage(p_case,p_expected,p_assignee,p_priority,p_note); $$;
revoke all on function public.triage_moderation_case(uuid,timestamptz,uuid,text,text) from public,anon,authenticated;
grant execute on function public.triage_moderation_case(uuid,timestamptz,uuid,text,text) to authenticated;

