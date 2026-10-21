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
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.submit_content_report('user',current_setting('test.subject')::uuid,'harassment','Critical user-account evidence');
reset role;
select set_config('test.permanent_case',(select id::text from public.moderation_cases where target_type='user' and target_id=current_setting('test.subject')::uuid and status<>'closed'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare c public.moderation_cases; d jsonb; denied boolean; begin
 select * into c from public.moderation_cases where id=current_setting('test.permanent_case')::uuid;
 perform public.triage_moderation_case(c.id,c.updated_at,auth.uid(),'urgent','Credible serious case evidence reviewed');
 select * into c from public.moderation_cases where id=c.id;
 d:=public.decide_moderation_case(c.id,c.updated_at,'request_changes','critical','harassment','A serious targeted threat was confirmed.','Evidence independently reviewed for approval.','permanent');
 if d->>'state'<>'proposed' or exists(select 1 from public.account_sanctions where decision_id=(d->>'id')::uuid) then raise exception 'Permanent activated without approval'; end if;
 if not exists(select 1 from public.account_sanctions s join public.moderation_decisions md on md.id=s.decision_id where md.case_id=c.id and s.kind='temp_suspend' and s.revoked_at is null) then raise exception 'Critical proposal missing provisional protection'; end if;
 perform set_config('test.permanent_decision',d->>'id',true);
 denied:=false;begin perform public.approve_moderation_decision((d->>'id')::uuid,(d->>'updated_at')::timestamptz,true,'short');exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Approval review note omitted'; end if;
 d:=public.approve_moderation_decision((d->>'id')::uuid,(d->>'updated_at')::timestamptz,true,'Separate permanent suspension review confirms critical evidence.');
 if not exists(select 1 from public.account_sanctions where decision_id=(d->>'id')::uuid and kind='permanent' and ends_at is null and revoked_at is null) then raise exception 'Permanent suspension failed';end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.subject'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare r jsonb; begin
 r:=public.get_my_moderation();
 if r->>'can_social'<>'false' or r->>'can_report'<>'true' then raise exception 'Permanent scope incorrect';end if;
 perform set_config('test.permanent_appeal',public.submit_moderation_appeal(current_setting('test.permanent_decision')::uuid,'An appeal remains available under permanent suspension.')->>'id',true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','is_anonymous',false)::text,true);
select public.review_moderation_appeal(current_setting('test.permanent_appeal')::uuid,'overturned','A final review found the original decision mistaken.','Separate appeal evidence reviewed and corrective action approved.');
do $$ begin
 if exists(select 1 from public.account_sanctions where user_id=current_setting('test.subject')::uuid and revoked_at is null) then raise exception 'Permanent reversal left restrictions';end if;
 if exists(select 1 from public.moderation_decisions where id=current_setting('test.permanent_decision')::uuid and state='confirmed') then raise exception 'Overturned finding still counts';end if;
end; $$;
reset role;
select 'Permanent proposal, provisional protection, final review, private appeal and full reversal passed' as result;
