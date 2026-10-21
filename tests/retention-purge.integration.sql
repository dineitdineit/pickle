-- Only synthetic fixtures; run inside BEGIN / ROLLBACK.
select set_config('test.purge_case',gen_random_uuid()::text,true);
select set_config('test.purge_decision',gen_random_uuid()::text,true);
select set_config('test.purge_report',gen_random_uuid()::text,true);
select set_config('request.jwt.claims','{}',true);
insert into public.moderation_cases(id,target_type,target_id,status,due_at) values(current_setting('test.purge_case')::uuid,'user',gen_random_uuid(),'closed',now());
insert into public.moderation_decisions(id,case_id,outcome,severity,clause,public_reason,internal_note,sanction,state,notified_at) values(current_setting('test.purge_decision')::uuid,current_setting('test.purge_case')::uuid,'dismiss','minor','none','Fixture public detail for retention.','Fixture private evidence for retention.','none','dismissed',now()-interval '31 days');
insert into public.content_reports(id,target_type,target_id,reason,details,snapshot,status,reviewed_at) values(current_setting('test.purge_report')::uuid,'user',gen_random_uuid(),'other','Fixture private report','{"private":"fixture"}','dismissed',now()-interval '31 days');
insert into public.moderation_case_reports(case_id,source,report_id) values(current_setting('test.purge_case')::uuid,'content',current_setting('test.purge_report')::uuid);
update public.moderation_cases set evidence_expires_at=now()-interval '1 day',history_expires_at=now()+interval '59 days' where id=current_setting('test.purge_case')::uuid;
insert into public.search_events(query,normalized_query,result_count,searched_at) values('retention old fixture','retention old fixture',1,now()-interval '31 days'),('retention recent fixture','retention recent fixture',1,now()-interval '29 days');
select retention_helpers.purge_records();
do $$ begin
 if exists(select 1 from public.content_reports where id=current_setting('test.purge_report')::uuid) then raise exception 'Expired report retained'; end if;
 if not exists(select 1 from public.moderation_decisions where id=current_setting('test.purge_decision')::uuid and internal_note='Detailed record deleted after 30 days.') then raise exception 'Minimal decision lost or details survived'; end if;
 if exists(select 1 from public.search_events where query='retention old fixture') or not exists(select 1 from public.search_events where query='retention recent fixture') then raise exception 'Search TTL boundary failed'; end if;
end; $$;
update public.moderation_cases set history_expires_at=now()-interval '1 day' where id=current_setting('test.purge_case')::uuid;
select retention_helpers.purge_records();
do $$ begin if exists(select 1 from public.moderation_cases where id=current_setting('test.purge_case')::uuid) or exists(select 1 from public.moderation_decisions where id=current_setting('test.purge_decision')::uuid) then raise exception '90-day minimal history not removed'; end if; end; $$;
-- Open appeals protect the working evidence until the review finishes.
select set_config('test.purge_case2',gen_random_uuid()::text,true);
select set_config('test.purge_decision2',gen_random_uuid()::text,true);
insert into public.moderation_cases(id,target_type,target_id,status,due_at) values(current_setting('test.purge_case2')::uuid,'user',gen_random_uuid(),'closed',now());
insert into public.moderation_decisions(id,case_id,outcome,severity,clause,public_reason,internal_note,sanction,state,notified_at) values(current_setting('test.purge_decision2')::uuid,current_setting('test.purge_case2')::uuid,'hide','standard','harassment','Fixture public detail for appeal.','Fixture protected appeal evidence.','none','confirmed',now());
insert into public.moderation_appeals(decision_id,user_id,explanation,due_at) values(current_setting('test.purge_decision2')::uuid,(select id from public.profiles limit 1),'A fixture appeal that must protect its evidence.',now());
update public.moderation_cases set evidence_expires_at=now()-interval '1 day',history_expires_at=now()-interval '1 day' where id=current_setting('test.purge_case2')::uuid;
select retention_helpers.purge_records();
do $$ begin if not exists(select 1 from public.moderation_decisions where id=current_setting('test.purge_decision2')::uuid and internal_note='Fixture protected appeal evidence.') then raise exception 'Working appeal evidence erased'; end if; end; $$;
update public.moderation_appeals set status='upheld',reviewed_at=now() where decision_id=current_setting('test.purge_decision2')::uuid;
update public.moderation_cases set evidence_expires_at=now()-interval '1 day',history_expires_at=now()-interval '1 day' where id=current_setting('test.purge_case2')::uuid;
insert into public.account_sanctions(decision_id,user_id,kind) values(current_setting('test.purge_decision2')::uuid,(select id from public.profiles where role='user' limit 1),'permanent');
select retention_helpers.purge_records();
do $$ begin if not exists(select 1 from public.moderation_cases where id=current_setting('test.purge_case2')::uuid) then raise exception 'Active restriction was erased'; end if; end; $$;
update public.account_sanctions set revoked_at=now() where decision_id=current_setting('test.purge_decision2')::uuid;
select retention_helpers.purge_records();
do $$ begin if exists(select 1 from public.moderation_cases where id=current_setting('test.purge_case2')::uuid) then raise exception 'Expired inactive history survived'; end if; end; $$;
select '30-day details/search expiry, 90-day minimal history and active appeal protection passed' as result;
