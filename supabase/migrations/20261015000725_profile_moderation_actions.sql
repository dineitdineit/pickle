create or replace function operations_helpers.apply_decision(p_decision uuid) returns jsonb
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
 message:=case when d.state='temporary' then 'A report is being reviewed. Provisional action: ' when d.outcome='dismiss' then 'A report about your content was reviewed; a violation was not confirmed. Action: ' else 'A policy violation was confirmed. Content action: ' end||d.outcome||'. Account action: '||d.sanction||'.'
 ||case when finish is not null then ' Restriction ends: '||to_char(finish at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.' when d.sanction='permanent' then ' The suspension has no automatic end date.' else '' end;
 perform operations_helpers.notice(d.id,d.subject_id,'account',d.outcome,'Clause: '||d.clause||'. '||d.public_reason,message,c.id,true);
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'decision:'||d.outcome||':'||d.sanction,d.internal_note);
 return (select to_jsonb(x) from public.moderation_decisions x where id=d.id);
end; $$;

