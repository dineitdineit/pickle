alter table public.moderation_cases add column evidence_expires_at timestamptz;
alter table public.moderation_cases add column history_expires_at timestamptz;
alter table public.moderation_cases add column evidence_deleted_at timestamptz;
create index moderation_evidence_expiry on public.moderation_cases(evidence_expires_at) where evidence_deleted_at is null;
create index moderation_history_expiry on public.moderation_cases(history_expires_at);
update public.moderation_cases c set evidence_expires_at=greatest(c.updated_at,coalesce((select max(reviewed_at) from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=c.id),c.updated_at))+interval '30 days',
 history_expires_at=greatest(c.updated_at,coalesce((select max(reviewed_at) from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=c.id),c.updated_at))+interval '90 days' where status='closed';
create function retention_helpers.case_deadline() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='closed' and (tg_op='INSERT' or old.status is distinct from 'closed') then new.evidence_expires_at:=now()+interval '30 days'; new.history_expires_at:=now()+interval '90 days'; end if;
 return new;
end; $$;
revoke all on function retention_helpers.case_deadline() from public,anon,authenticated;
create trigger retention_case_deadline before insert or update on public.moderation_cases for each row execute function retention_helpers.case_deadline();
create function retention_helpers.case_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 if tg_table_name='moderation_appeals' then select case_id into cid from public.moderation_decisions where id=new.decision_id;
 else cid:=new.case_id; end if;
 update public.moderation_cases set evidence_expires_at=now()+interval '30 days',history_expires_at=now()+interval '90 days',evidence_deleted_at=null where id=cid and status='closed';
 return new;
end; $$;
revoke all on function retention_helpers.case_activity() from public,anon,authenticated;
create trigger retention_case_activity after insert on public.moderation_case_events for each row execute function retention_helpers.case_activity();
create trigger retention_appeal_activity after insert or update of status on public.moderation_appeals for each row execute function retention_helpers.case_activity();

-- Retired legacy report history may outlive a report only as a minimal action row.
do $$ declare cname text; begin
 select conname into strict cname from pg_constraint where conrelid='public.content_moderation_actions'::regclass and confrelid='public.content_reports'::regclass and contype='f';
 execute format('alter table public.content_moderation_actions drop constraint %I',cname);
 alter table public.content_moderation_actions alter column report_id drop not null;
 alter table public.content_moderation_actions add constraint content_moderation_actions_report_id_fkey foreign key(report_id) references public.content_reports(id) on delete set null;
end; $$;

create function retention_helpers.purge_records() returns jsonb language plpgsql security definer set search_path='' as $$
declare c record; detail_count integer:=0; history_count integer:=0; searches integer; emails integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('pickle:retention-purge',0)) then return jsonb_build_object('busy',true); end if;
 delete from public.search_events where searched_at<=now()-interval '30 days'; get diagnostics searches=row_count;
 delete from public.user_notifications where kind='moderation' and created_at<=now()-interval '30 days';
 delete from moderation_helpers.email_outbox where coalesce(sent_at,created_at)<=now()-interval '30 days' and not(status='processing' and lease_until>now()); get diagnostics emails=row_count;
 for c in select id from public.moderation_cases mc where status='closed' and evidence_expires_at<=now() and evidence_deleted_at is null
  and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=mc.id and a.status='open')
  order by evidence_expires_at limit 100 for update skip locked loop
  delete from public.content_reports where id in(select report_id from public.moderation_case_reports where case_id=c.id and source='content');
  delete from public.comment_reports where id in(select report_id from public.moderation_case_reports where case_id=c.id and source='comment');
  update public.moderation_decisions set public_reason='Detailed record deleted after 30 days.',internal_note='Detailed record deleted after 30 days.',approval_note=null,proposed_by=null,approved_by=null where case_id=c.id;
  update public.moderation_appeals set explanation='Detailed record deleted after 30 days.',response=null,internal_note=null,reviewed_by=null where decision_id in(select id from public.moderation_decisions where case_id=c.id);
  update public.moderation_case_events set actor_id=null,note='Detailed record deleted after 30 days.' where case_id=c.id;
  update public.moderation_case_reports set reporter_id=null where case_id=c.id;
  update public.moderation_cases set evidence_deleted_at=now(),assignee_id=null where id=c.id;
  detail_count:=detail_count+1;
 end loop;
 delete from public.content_reports cr where status<>'open' and coalesce(reviewed_at,created_at)<=now()-interval '30 days'
  and not exists(select 1 from public.moderation_case_reports l join public.moderation_cases c on c.id=l.case_id where l.source='content' and l.report_id=cr.id and c.evidence_deleted_at is null);
 delete from public.comment_reports cr where status<>'open' and coalesce(reviewed_at,created_at)<=now()-interval '30 days'
  and not exists(select 1 from public.moderation_case_reports l join public.moderation_cases c on c.id=l.case_id where l.source='comment' and l.report_id=cr.id and c.evidence_deleted_at is null);
 update public.content_moderation_actions set note=null where created_at<=now()-interval '30 days' and note is not null;
 update public.moderation_actions set note=null where created_at<=now()-interval '30 days' and note is not null;
 delete from public.content_moderation_actions where created_at<=now()-interval '90 days';
 delete from public.moderation_actions where created_at<=now()-interval '90 days';
 for c in select id from public.moderation_cases mc where status='closed' and history_expires_at<=now() and evidence_deleted_at is not null
  and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=mc.id and a.status='open')
  and not exists(select 1 from public.account_sanctions s join public.moderation_decisions d on d.id=s.decision_id where d.case_id=mc.id and s.revoked_at is null and (s.ends_at is null or s.ends_at>now()))
  order by history_expires_at limit 100 for update skip locked loop
  delete from public.account_sanctions where decision_id in(select id from public.moderation_decisions where case_id=c.id);
  delete from public.moderation_appeals where decision_id in(select id from public.moderation_decisions where case_id=c.id);
  delete from public.moderation_decisions where case_id=c.id;
  delete from public.moderation_case_events where case_id=c.id;
  delete from public.moderation_cases where id=c.id;
  history_count:=history_count+1;
 end loop;
 delete from retention_helpers.runs where started_at<=now()-interval '30 days';
 insert into retention_helpers.runs(results) values(jsonb_build_object('searches',searches,'emails',emails,'evidence',detail_count,'history',history_count));
 return jsonb_build_object('searches',searches,'emails',emails,'evidence',detail_count,'history',history_count);
end; $$;
revoke all on function retention_helpers.purge_records() from public,anon,authenticated,service_role;

create function retention_helpers.status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform operations_helpers.require_admin();
 return jsonb_build_object('retention_days',30,'minimum_history_days',90,
 'worker_scheduled',exists(select 1 from cron.job where jobname='pickle-retention-worker' and active),
 'purge_scheduled',exists(select 1 from cron.job where jobname='pickle-retention-purge' and active),
 'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from(select status,count(*) n from retention_helpers.deletion_jobs group by status) x),
 'overdue_backups',(select count(*) from retention_helpers.deletion_jobs where status='completed' and expires_at<=now()),
 'unverified_backups',(select count(*) from retention_helpers.deletion_jobs where status='completed' and backup_verified_at is null and expires_at>now()),
 'last_purge',(select jsonb_build_object('at',started_at,'counts',results) from retention_helpers.runs order by started_at desc limit 1),
 'jobs',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select id,status,requested_at,completed_at,expires_at,attempts,next_attempt_at,last_error,backup_verified_at from retention_helpers.deletion_jobs order by requested_at desc limit 30) x));
end; $$;
revoke all on function retention_helpers.status() from public,anon,authenticated;
grant execute on function retention_helpers.status() to authenticated;
create function public.admin_retention_status() returns jsonb language sql stable security invoker set search_path='' as $$ select retention_helpers.status(); $$;
revoke all on function public.admin_retention_status() from public,anon,authenticated;
grant execute on function public.admin_retention_status() to authenticated;
create function retention_helpers.retry_job(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform operations_helpers.require_admin();
 update retention_helpers.deletion_jobs set next_attempt_at=now(),last_error=null where id=p_job and status in('pending','retry');
 return jsonb_build_object('id',p_job,'queued',found);
end; $$;
revoke all on function retention_helpers.retry_job(uuid) from public,anon,authenticated;
grant execute on function retention_helpers.retry_job(uuid) to authenticated;
create function public.admin_retry_account_deletion(p_job uuid) returns jsonb language sql security invoker set search_path='' as $$ select retention_helpers.retry_job(p_job); $$;
revoke all on function public.admin_retry_account_deletion(uuid) from public,anon,authenticated;
grant execute on function public.admin_retry_account_deletion(uuid) to authenticated;
