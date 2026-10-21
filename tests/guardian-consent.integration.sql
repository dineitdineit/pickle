-- Synthetic accounts only. Run in BEGIN/ROLLBACK, never keep these fixtures.
select set_config('test.guardian_child',gen_random_uuid()::text,true);
select set_config('test.guardian_adult',gen_random_uuid()::text,true);
select set_config('test.guardian_admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select value::uuid,'fixture-'||value||'@example.invalid',jsonb_build_object('username','guardian_'||replace(value,'-',''))
from jsonb_array_elements_text(jsonb_build_array(current_setting('test.guardian_child'),current_setting('test.guardian_adult'),current_setting('test.guardian_admin')));
update public.profiles set role='official' where id=current_setting('test.guardian_admin')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_child'),'role','authenticated','is_anonymous',false,'user_metadata',jsonb_build_object('adult',true))::text,true);
set local role authenticated;
do $$ declare state jsonb; denied boolean; begin
 denied:=false;
 begin perform public.confirm_account_age_v2(((now() at time zone 'UTC')::date-interval '13 years'+interval '1 day')::date); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Under-13 accepted'; end if;
 state:=public.confirm_account_age_v2(((now() at time zone 'UTC')::date-interval '13 years')::date);
 if state->>'eligible'<>'false' or state->>'guardian_status'<>'pending' or state->>'guardian_required'<>'true' or state->>'guardian_request_id' is null then raise exception '13th birthday did not enter review'; end if;
 perform set_config('test.guardian_request',state->>'guardian_request_id',true);
 if operations_helpers.can_act('publish') or operations_helpers.can_act('message') or operations_helpers.can_act('social') or operations_helpers.can_act('content_upload') or not operations_helpers.can_act('report') then raise exception 'Guardian gate bypass or safety regression'; end if;
 state:=public.confirm_account_age_v2('1990-01-01');
 if state->>'eligible'<>'false' or state->>'guardian_required'<>'true' then raise exception 'Re-entered birthday bypassed guardian consent'; end if;
 if (public.request_guardian_consent()->>'guardian_request_id')<>current_setting('test.guardian_request') then raise exception 'Duplicate guardian request'; end if;
 if (public.get_content_policy_state()->>'version')<>state->>'guardian_policy_version' then raise exception 'Pending guardian cannot read matching policy'; end if;
 denied:=false;
 begin perform public.review_guardian_consent(current_setting('test.guardian_request')::uuid,'approved','fixture-reference',true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Child approved their consent'; end if;
 if public.get_account_age_status()->>'minimum_age'<>'18' or public.get_account_age_status()->>'eligible'<>'false' then raise exception 'Legacy payload unsafe'; end if;
 perform public.confirm_account_age('1990-01-01');
 if public.get_account_age_status_v2()->>'eligible'<>'false' then raise exception 'Legacy birthday bypassed guardian gate'; end if;
 denied:=false;
 begin perform public.admin_guardian_requests_page('pending',0); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-admin page access'; end if;
 denied:=false;
 begin update public.account_age_confirmations set requires_guardian=false,minimum_age=14 where user_id=auth.uid(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Direct age update allowed'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_adult'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.profiles where id=current_setting('test.guardian_child')::uuid) then raise exception 'Pending profile exposed'; end if;
 if (public.get_recipe_author(current_setting('test.guardian_child')::uuid)->>'username') is not null then raise exception 'Profile RPC exposed pending identity'; end if;
 if public.confirm_account_age_v2(((now() at time zone 'UTC')::date-interval '14 years')::date)->>'eligible'<>'true' then raise exception '14th birthday denied'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_admin'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare denied boolean:=false; begin
 if not exists(select 1 from jsonb_array_elements(public.admin_guardian_requests_page('pending',0)) r where r->>'request_id'=current_setting('test.guardian_request')) then raise exception 'Admin queue missing request'; end if;
 begin perform public.review_guardian_consent(current_setting('test.guardian_request')::uuid,'approved','fixture-approval',false); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Approval without verification accepted'; end if;
 perform public.review_guardian_consent(current_setting('test.guardian_request')::uuid,'approved','fixture-approval',true);
 perform public.review_guardian_consent(current_setting('test.guardian_request')::uuid,'approved','fixture-approval',true);
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_child'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if public.get_account_age_status_v2()->>'eligible'<>'true' or not operations_helpers.can_act('publish') then raise exception 'Approved guardian account not activated'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_admin'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.review_guardian_consent(current_setting('test.guardian_request')::uuid,'revoked','fixture-withdrawal',false);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_child'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if public.get_account_age_status_v2()->>'eligible'<>'false' or operations_helpers.can_act('publish') or operations_helpers.can_act('message') then raise exception 'Withdrawal failed to pause account'; end if;
 if public.request_guardian_consent()->>'guardian_status'<>'revoked' then raise exception 'Client reset revoked status'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 if (select count(*) from guardian_helpers.reviews where request_id=current_setting('test.guardian_request')::uuid)<>2 then raise exception 'Missing or duplicate consent audit'; end if;
 if guardian_helpers.public_allowed(current_setting('test.guardian_child')::uuid) then raise exception 'Withdrawn profile visible'; end if;
end; $$;
-- Existing adult confirmations stay valid; deletion cascades request and audit.
insert into public.account_age_confirmations(user_id,rule_version,minimum_age) values(current_setting('test.guardian_admin')::uuid,'18-plus-v1',18);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_admin'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if public.get_account_age_status_v2()->>'eligible'<>'true' or public.get_account_age_status()->>'eligible'<>'true' or public.get_account_age_status()->>'minimum_age'<>'18' then raise exception 'Existing adult confirmation invalidated'; end if; end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
delete from auth.users where id=current_setting('test.guardian_child')::uuid;
do $$ begin if exists(select 1 from guardian_helpers.requests where user_id=current_setting('test.guardian_child')::uuid) or exists(select 1 from guardian_helpers.reviews where request_id=current_setting('test.guardian_request')::uuid) then raise exception 'Guardian data did not cascade'; end if; end; $$;
select 'Guardian boundary, pending gate, immutable age, policy access, private profile, admin-only verified approval, idempotency, withdrawal, audit, legacy and deletion passed' as result;
