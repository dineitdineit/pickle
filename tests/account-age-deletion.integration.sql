-- Fixtures only. Execute inside BEGIN / ROLLBACK; never retain these accounts.
select set_config('test.age_a',gen_random_uuid()::text,true);
select set_config('test.age_b',gen_random_uuid()::text,true);
select set_config('test.age_recipe',gen_random_uuid()::text,true);
select set_config('test.other_recipe',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
(current_setting('test.age_a')::uuid,'fixture-'||current_setting('test.age_a')||'@example.invalid',jsonb_build_object('username','fixture_'||replace(current_setting('test.age_a'),'-',''))),
(current_setting('test.age_b')::uuid,'fixture-'||current_setting('test.age_b')||'@example.invalid',jsonb_build_object('username','fixture_'||replace(current_setting('test.age_b'),'-','')));
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id) values
('Fixture recipe summary',current_setting('test.age_recipe')::uuid,'Account deletion fixture','Easy',10,current_setting('test.age_a')::uuid),
('Fixture recipe summary',current_setting('test.other_recipe')::uuid,'Other owner fixture','Easy',10,current_setting('test.age_b')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.age_a'),'role','authenticated','is_anonymous',false,'user_metadata',jsonb_build_object('adult',true))::text,true);
set local role authenticated;
do $$ declare denied boolean; result jsonb; begin
 if (public.get_account_age_status_v2()->>'eligible')<>'false' or operations_helpers.can_act('publish') or not operations_helpers.can_act('report') then raise exception 'Missing age guard or unsafe safety-report restriction'; end if;
 denied:=false;
 begin perform public.confirm_account_age_v2(((now() at time zone 'UTC')::date-interval '13 years'+interval '1 day')::date); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Underage accepted'; end if;
 if exists(select 1 from public.account_age_confirmations) then raise exception 'Rejected birthday stored'; end if;
 denied:=false;
 begin insert into public.account_age_confirmations(user_id,rule_version,minimum_age) values(auth.uid(),'18-plus-v1',18); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Direct confirmation forgery'; end if;
 result:=public.confirm_account_age_v2(((now() at time zone 'UTC')::date-interval '18 years')::date);
 if result->>'eligible'<>'true' or not operations_helpers.can_act('publish') then raise exception '18th birthday denied'; end if;
 perform public.confirm_account_age_v2('1990-01-01');
 if (select count(*) from public.account_age_confirmations)<>1 then raise exception 'Confirmation not idempotent'; end if;
 denied:=false;
 begin perform public.prepare_account_deletion(current_setting('test.age_b')::uuid); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Client prepared another account deletion'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select public.prepare_account_deletion(current_setting('test.age_a')::uuid);
select public.prepare_account_deletion(current_setting('test.age_a')::uuid);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.age_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if operations_helpers.can_act('content_upload') or operations_helpers.can_act('social') or operations_helpers.can_act('message') then raise exception 'Deleting account accepted new writes'; end if;
 if not operations_helpers.can_act('report') then raise exception 'Safety reporting blocked during deletion'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
delete from auth.users where id=current_setting('test.age_a')::uuid;
do $$ begin
 if exists(select 1 from public.profiles where id=current_setting('test.age_a')::uuid) or exists(select 1 from public.recipes where id=current_setting('test.age_recipe')::uuid) or exists(select 1 from public.account_age_confirmations where user_id=current_setting('test.age_a')::uuid) or exists(select 1 from operations_helpers.account_deletions where user_id=current_setting('test.age_a')::uuid) then raise exception 'Account data did not cascade'; end if;
 if not exists(select 1 from public.recipes where id=current_setting('test.other_recipe')::uuid and not is_hidden) then raise exception 'Another owner was affected'; end if;
end; $$;
select 'Age boundary, metadata/insert bypass denial, safety access, service-only deletion, retry, account freeze and recipe cascade passed' as result;
