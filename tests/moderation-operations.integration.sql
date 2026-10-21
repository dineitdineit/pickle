-- Run BEGIN / ROLLBACK. Roles, consent, notices, emails and all actions are fixtures.
select set_config('test.subject',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.reporter',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.operator',(select id::text from public.profiles order by id offset 2 limit 1),true);
select set_config('request.jwt.claims','{}',true);
update public.profiles set role='user';
update public.profiles set role='official' where id=current_setting('test.operator')::uuid;
delete from public.user_blocks;
insert into public.user_content_consents(user_id,policy_version) select p.id,v.version from public.profiles p cross join public.content_policy_versions v where v.active on conflict do nothing;
select set_config('test.recipe1',gen_random_uuid()::text,true);
select set_config('test.recipe2',gen_random_uuid()::text,true);
select set_config('test.recipe3',gen_random_uuid()::text,true);
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id) values
('Fixture recipe summary',current_setting('test.recipe1')::uuid,'Operations fixture one','Easy',10,current_setting('test.subject')::uuid),
('Fixture recipe summary',current_setting('test.recipe2')::uuid,'Operations fixture two','Easy',10,current_setting('test.subject')::uuid),
('Fixture recipe summary',current_setting('test.recipe3')::uuid,'Operations fixture three','Easy',10,current_setting('test.subject')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.submit_content_report('recipe',current_setting('test.recipe1')::uuid,'spam','Fixture evidence one');
select public.submit_content_report('recipe',current_setting('test.recipe2')::uuid,'spam','Fixture evidence two');
select public.submit_content_report('recipe',current_setting('test.recipe3')::uuid,'harassment','Fixture evidence three');
do $$ declare denied boolean:=false; begin
 begin perform public.get_moderation_workspace(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-admin workspace access'; end if;
 if exists(select 1 from public.moderation_cases) or exists(select 1 from public.moderation_decisions) then raise exception 'Private cases leaked'; end if;
end; $$;
reset role;
select set_config('test.case1',(select id::text from public.moderation_cases where target_id=current_setting('test.recipe1')::uuid and status<>'closed'),true);
select set_config('test.case2',(select id::text from public.moderation_cases where target_id=current_setting('test.recipe2')::uuid and status<>'closed'),true);
select set_config('test.case3',(select id::text from public.moderation_cases where target_id=current_setting('test.recipe3')::uuid and status<>'closed'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare c public.moderation_cases; result jsonb; denied boolean; begin
 if jsonb_array_length(public.get_moderation_workspace()->'cases')<3 then raise exception 'Intake missing'; end if;
 select * into c from public.moderation_cases where id=current_setting('test.case1')::uuid;
 denied:=false;
 begin perform public.triage_moderation_case(c.id,c.updated_at,current_setting('test.reporter')::uuid,'normal','Conflict reviewer evidence'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Involved reviewer assignment'; end if;
 perform public.triage_moderation_case(c.id,c.updated_at,auth.uid(),'normal','Reviewed snapshot and full context');
 select * into c from public.moderation_cases where id=c.id;
 result:=public.decide_moderation_case(c.id,c.updated_at,'hide','minor','scam_spam','Confirmed one spam incident.','Internal evidence fixture one.','warning');
 if result->>'state'<>'confirmed' then raise exception 'Warning not confirmed'; end if;
 perform set_config('test.decision1',result->>'id',true);
 if exists(select 1 from public.account_sanctions where decision_id=(result->>'id')::uuid) then raise exception 'Warning restricted features'; end if;
 if exists(select 1 from public.recipes where id=current_setting('test.recipe1')::uuid) then raise exception 'Hidden recipe visible'; end if;
 denied:=false;
 begin perform public.decide_moderation_case(c.id,c.updated_at,'hide','minor','scam_spam','Duplicate finding forbidden.','Internal duplicate fixture.','warning'); exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Same incident counted twice'; end if;
 select * into c from public.moderation_cases where id=current_setting('test.case2')::uuid;
 perform public.triage_moderation_case(c.id,c.updated_at,auth.uid(),'normal','Reviewed new repeat evidence');
 select * into c from public.moderation_cases where id=c.id;
 result:=public.decide_moderation_case(c.id,c.updated_at,'remove','repeated','scam_spam','A repeated spam incident was confirmed.','Internal second incident evidence.','restrict_3');
 if result->>'state'<>'confirmed' then raise exception '3 day restriction not active'; end if;
 perform set_config('test.decision2',result->>'id',true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.subject'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare state jsonb; denied boolean; begin
 state:=public.get_my_moderation();
 if state->>'can_publish'<>'false' or state->>'can_message'<>'false' or state->>'can_social'<>'true' or state->>'can_report'<>'true' then raise exception '3 day scope incorrect'; end if;
 if state::text like '%Internal second%' or state::text like '%reporter_id%' or state::text like '%internal_note%' then raise exception 'Internal information leaked'; end if;
 denied:=false;
 begin perform public.send_direct_message(current_setting('test.reporter')::uuid,'Forbidden during restriction',gen_random_uuid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Restriction message bypass'; end if;
 denied:=false;
 begin insert into public.recipe_comments(recipe_id,user_id,content) values(current_setting('test.recipe3')::uuid,auth.uid(),'Forbidden post'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Restriction comment bypass'; end if;
 perform public.set_user_follow(current_setting('test.reporter')::uuid,true);
 perform public.submit_content_report('user',current_setting('test.reporter')::uuid,'other','Still allowed safety report');
 perform set_config('test.appeal2',public.submit_moderation_appeal(current_setting('test.decision2')::uuid,'Please reconsider the repeated spam finding; this is fixture context.')->>'id',true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare result jsonb; begin
 result:=public.review_moderation_appeal(current_setting('test.appeal2')::uuid,'overturned','The second finding was mistaken after review.','Internal appeal re-review evidence.');
 if result->>'status'<>'overturned' then raise exception 'Appeal reversal failed'; end if;
 if exists(select 1 from public.account_sanctions where decision_id=current_setting('test.decision2')::uuid and revoked_at is null) then raise exception 'Reversal retained restriction'; end if;
 if not exists(select 1 from public.recipes where id=current_setting('test.recipe2')::uuid and not moderation_removed) then raise exception 'Removed content not restored'; end if;
end; $$;
-- A critical incident may skip repeat thresholds, but long suspension requires approval.
do $$ declare c public.moderation_cases; result jsonb; begin
 select * into c from public.moderation_cases where id=current_setting('test.case3')::uuid;
 perform public.triage_moderation_case(c.id,c.updated_at,auth.uid(),'urgent','Specific urgent threat evidence reviewed');
 select * into c from public.moderation_cases where id=c.id;
 result:=public.decide_moderation_case(c.id,c.updated_at,'hide','critical','harassment','A specific credible threat was confirmed.','Internal threat evidence and rationale.','suspend_7');
 if result->>'state'<>'proposed' then raise exception 'Long suspension skipped proposal'; end if;
 if exists(select 1 from public.account_sanctions where decision_id=(result->>'id')::uuid) then raise exception 'Proposal already active'; end if;
 perform set_config('test.decision3',result->>'id',true);
 result:=public.approve_moderation_decision((result->>'id')::uuid,(result->>'updated_at')::timestamptz,true,'Separate final review of credible threat evidence.');
 if result->>'state'<>'confirmed' then raise exception 'Final approval failed'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.subject'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare denied boolean; state jsonb; begin
 state:=public.get_my_moderation();
 if state->>'can_publish'<>'false' or state->>'can_message'<>'false' or state->>'can_social'<>'false' or state->>'can_report'<>'true' then raise exception 'Suspension scope incorrect'; end if;
 denied:=false;
 begin insert into public.recipe_likes(recipe_id,user_id) values(current_setting('test.recipe2')::uuid,auth.uid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Suspended like bypass'; end if;
 perform public.submit_moderation_appeal(current_setting('test.decision3')::uuid,'This appeal remains available while my account is suspended.');
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
-- Simulate time passage without waiting; all changes are rolled back.
update public.account_sanctions set starts_at=now()-interval '8 days',ends_at=now()-interval '1 day' where decision_id=current_setting('test.decision3')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.subject'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if (public.get_my_moderation()->>'can_social')<>'true' then raise exception 'Expired suspension not lifted'; end if; end; $$;
reset role;
select 'Intake, conflicts, private data, warning/strike dedup, restrictions, proposals/approval, appeals/reversal, restoration and automatic expiry passed' as result;
