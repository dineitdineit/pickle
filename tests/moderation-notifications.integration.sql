-- Append after content-reports.integration.sql in the same BEGIN / ROLLBACK.
do $$ declare event uuid; original_count integer; begin
 if (select count(*) from public.user_notifications where recipient_id=current_setting('test.owner')::uuid and kind='moderation' and created_at>=transaction_timestamp())<>4 then raise exception 'Expected exactly recipe/review hide and comment hide/removal notices'; end if;
 if (select count(*) from moderation_helpers.email_outbox where recipient_id=current_setting('test.owner')::uuid and created_at>=transaction_timestamp())<>4 then raise exception 'Email outbox and app notices differ'; end if;
 if exists(select 1 from public.user_notifications where kind='moderation' and created_at>=transaction_timestamp() and (actor_id is not null or recipe_id is not null or moderation_details::text like '%admin memo%')) then raise exception 'Internal admin data leaked'; end if;
 if not exists(select 1 from public.user_notifications where recipient_id=current_setting('test.owner')::uuid and moderation_details->>'type'='recipe' and moderation_details->>'reason'='Spam') then raise exception 'Recipe sanction reason missing'; end if;
 select moderation_event_id into event from public.user_notifications where recipient_id=current_setting('test.owner')::uuid and kind='moderation' and moderation_details->>'type'='recipe' and created_at>=transaction_timestamp() limit 1;
 select count(*) into original_count from moderation_helpers.email_outbox;
 perform moderation_helpers.notify_sanction(event,current_setting('test.owner')::uuid,'recipe',current_setting('test.recipe')::uuid,'Duplicate fixture','hide','spam');
 if (select count(*) from moderation_helpers.email_outbox)<>original_count then raise exception 'Duplicate event created duplicate email'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare blocked boolean:=false; begin
 if (select count(*) from public.user_notifications where kind='moderation' and created_at>=transaction_timestamp())<>4 then raise exception 'Author cannot see own notices'; end if;
 update public.user_notifications set read_at=now() where kind='moderation' and created_at>=transaction_timestamp();
 begin perform public.claim_moderation_emails('admin@getpickleapp.com',5); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'User claimed email queue'; end if;
 blocked:=false;
 begin perform 1 from moderation_helpers.email_outbox; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'User read private email queue'; end if;
 blocked:=false;
 begin update public.user_notifications set moderation_details='{}'::jsonb where kind='moderation'; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'User changed sanction message'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if exists(select 1 from public.user_notifications where recipient_id=current_setting('test.owner')::uuid and kind='moderation') then raise exception 'Other account read author notices'; end if;
 if public.admin_moderation_email_status()->'counts' is null then raise exception 'Admin delivery status unavailable'; end if;
end; $$;
reset role;
-- Rehiding restored content creates one new notice. Dismissal/restoration do not.
set local role authenticated;
do $$ declare report jsonb; event uuid; begin
 report:=public.submit_content_report('recipe',current_setting('test.recipe')::uuid,'spam',null);
 perform public.moderate_content_report((report->>'id')::uuid,'hide','PRIVATE ADMIN NOTE');
end; $$;
reset role;
do $$ declare event uuid; total integer; begin
 select id into event from moderation_helpers.email_outbox where recipient_id=current_setting('test.owner')::uuid and created_at>=transaction_timestamp() order by id limit 1;
 perform set_config('test.email_job',event::text,true);
 select count(*) into total from public.user_notifications where kind='moderation' and recipient_id=current_setting('test.owner')::uuid and created_at>=transaction_timestamp();
 if total<>5 then raise exception 'Rehide notice was not created'; end if;
 -- Notification and email remain after the source recipe is physically deleted.
 delete from public.recipes where id=current_setting('test.recipe')::uuid;
 if (select count(*) from public.user_notifications where kind='moderation' and recipient_id=current_setting('test.owner')::uuid and created_at>=transaction_timestamp())<>total then raise exception 'Source deletion lost sanction notices'; end if;
end; $$;
update auth.users set email=current_setting('test.owner')||'@example.invalid',email_confirmed_at=now() where id=current_setting('test.owner')::uuid;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$ declare jobs jsonb; job jsonb; duplicate jsonb; ack boolean; begin
 jobs:=public.claim_moderation_emails('admin@getpickleapp.com',5);
 if jsonb_array_length(jobs)<>5 then raise exception 'Worker did not lease all fixture jobs'; end if;
 duplicate:=public.claim_moderation_emails('admin@getpickleapp.com',5);
 if jsonb_array_length(duplicate)<>0 then raise exception 'Two workers claimed same leases'; end if;
 job:=jobs->0;
 perform set_config('test.leased_email',job->>'id',true);
 perform set_config('test.email_lease',job->>'lease_token',true);
 if job->>'to_email'<>current_setting('test.owner')||'@example.invalid' or job->>'sender'<>'admin@getpickleapp.com' then raise exception 'Verified recipient / sender incorrect'; end if;
 if position('PRIVATE ADMIN NOTE' in (job->>'body'))>0 then raise exception 'Admin memo leaked to email'; end if;
 ack:=public.finish_moderation_email((job->>'id')::uuid,gen_random_uuid(),'sent','fake-provider-id',null);
 if ack then raise exception 'Stale lease acknowledged'; end if;
 ack:=public.finish_moderation_email((job->>'id')::uuid,(job->>'lease_token')::uuid,'sent','fake-provider-id',null);
 if not ack then raise exception 'Worker acceptance not saved'; end if;
 job:=jobs->1;
 ack:=public.finish_moderation_email((job->>'id')::uuid,(job->>'lease_token')::uuid,'retry',null,'provider_http_429');
 if not ack then raise exception 'Retry failed'; end if;
end; $$;
reset role;
do $$ begin
 if not exists(select 1 from moderation_helpers.email_outbox where id=current_setting('test.leased_email')::uuid and status='sent' and provider_id='fake-provider-id' and sent_at is not null) then raise exception 'Acceptance record missing'; end if;
 if not exists(select 1 from moderation_helpers.email_outbox where recipient_id=current_setting('test.owner')::uuid and status='retry' and attempts=1 and next_attempt_at>now()) then raise exception 'Backoff missing'; end if;
end; $$;
-- Unverified email addresses are skipped; app notices remain available.
insert into moderation_helpers.email_outbox(id,recipient_id,subject,body) values(gen_random_uuid(),current_setting('test.reporter')::uuid,'Fixture','Fixture');
update auth.users set email_confirmed_at=null where id=current_setting('test.reporter')::uuid;
set local role service_role;
select public.claim_moderation_emails('admin@getpickleapp.com',5);
reset role;
do $$ begin
 if not exists(select 1 from moderation_helpers.email_outbox where recipient_id=current_setting('test.reporter')::uuid and status='skipped' and last_error='no_verified_email') then raise exception 'Unverified email not skipped'; end if;
end; $$;
select 'Atomic author notices/outbox, no internal data leaks, ownership, deletion retention, rehide, service-only leases, stale acknowledgement, verified recipients and retry backoff passed' as result;
