create or replace function retention_helpers.purge_records() returns jsonb language plpgsql security definer set search_path='' as $$
declare case_row record; detail_count integer:=0; history_count integer:=0; searches integer; emails integer;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('pickle:retention-purge',0)) then return jsonb_build_object('busy',true); end if;
 delete from public.search_events where searched_at<=now()-interval '30 days'; get diagnostics searches=row_count;
 delete from public.user_notifications where kind='moderation' and created_at<=now()-interval '30 days';
 delete from moderation_helpers.email_outbox where coalesce(sent_at,created_at)<=now()-interval '30 days' and not(status='processing' and lease_until>now()); get diagnostics emails=row_count;
 for case_row in select id from public.moderation_cases mc where status='closed' and evidence_expires_at<=now() and evidence_deleted_at is null
  and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=mc.id and a.status='open')
  order by evidence_expires_at limit 100 for update skip locked loop
  delete from public.content_reports where id in(select report_id from public.moderation_case_reports where case_id=case_row.id and source='content');
  delete from public.comment_reports where id in(select report_id from public.moderation_case_reports where case_id=case_row.id and source='comment');
  update public.moderation_decisions set public_reason='Detailed record deleted after 30 days.',internal_note='Detailed record deleted after 30 days.',approval_note=null,proposed_by=null,approved_by=null where case_id=case_row.id;
  update public.moderation_appeals set explanation='Detailed record deleted after 30 days.',response=null,internal_note=null,reviewed_by=null where decision_id in(select id from public.moderation_decisions where case_id=case_row.id);
  update public.moderation_case_events set actor_id=null,note='Detailed record deleted after 30 days.' where case_id=case_row.id;
  update public.moderation_case_reports set reporter_id=null where case_id=case_row.id;
  update public.moderation_cases set evidence_deleted_at=now(),assignee_id=null where id=case_row.id;
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
 for case_row in select id from public.moderation_cases mc where status='closed' and history_expires_at<=now() and evidence_deleted_at is not null
  and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=mc.id and a.status='open')
  and not exists(select 1 from public.account_sanctions s join public.moderation_decisions d on d.id=s.decision_id where d.case_id=mc.id and s.revoked_at is null and (s.ends_at is null or s.ends_at>now()))
  order by history_expires_at limit 100 for update skip locked loop
  delete from public.account_sanctions where decision_id in(select id from public.moderation_decisions where case_id=case_row.id);
  delete from public.moderation_appeals where decision_id in(select id from public.moderation_decisions where case_id=case_row.id);
  delete from public.moderation_decisions where case_id=case_row.id;
  delete from public.moderation_case_events where case_id=case_row.id;
  delete from public.moderation_cases where id=case_row.id;
  history_count:=history_count+1;
 end loop;
 delete from retention_helpers.runs where started_at<=now()-interval '30 days';
 insert into retention_helpers.runs(results) values(jsonb_build_object('searches',searches,'emails',emails,'evidence',detail_count,'history',history_count));
 return jsonb_build_object('searches',searches,'emails',emails,'evidence',detail_count,'history',history_count);
end; $$;

create or replace function retention_helpers.dispatch_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; project_url text;
begin
 if not exists(select 1 from retention_helpers.deletion_jobs where (status<>'completed' and next_attempt_at<=now() and (lease_until is null or lease_until<now())) or (status='completed' and (backup_verified_at is null or expires_at<=now()))) and not exists(select 1 from storage.objects o where bucket_id='retention-backups' and o.created_at<=now()-interval '30 days') then return null; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='retention_worker_secret';
 if secret is null then raise exception 'Retention scheduler not configured'; end if;
 -- Project-specific URL is configured below; no API key/secret is stored in cron text.
 select decrypted_secret into project_url from vault.decrypted_secrets where name='retention_worker_url';
 if project_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/retention-worker$' or project_url is null then raise exception 'Retention URL not configured'; end if;
 return net.http_post(url=>project_url,headers=>jsonb_build_object('Content-Type','application/json','X-Retention-Worker-Secret',secret),body=>'{}'::jsonb,timeout_milliseconds=>60000);
end; $$;

create index retention_runs_expiry on retention_helpers.runs(started_at);
