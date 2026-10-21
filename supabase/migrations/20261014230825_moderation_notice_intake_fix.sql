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
    select distinct m.reporter_id,null::uuid,'moderation',gen_random_uuid(),jsonb_build_object('type','report_result','action',new.status,'message',case when new.status='dismissed' then 'Your report was reviewed. A policy violation was not confirmed.' else 'Your report was reviewed and appropriate action was taken.' end)
    from public.moderation_case_reports m where m.case_id=cid and m.reporter_id is not null;
  end if;
 end if;
 return new;
end; $$;


