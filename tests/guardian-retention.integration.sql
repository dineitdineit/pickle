-- BEGIN/ROLLBACK fixture test; no fixture or deletion is committed.
select set_config('test.guardian_expired',gen_random_uuid()::text,true);
select set_config('test.guardian_kept',gen_random_uuid()::text,true);
insert into auth.users(id,email,created_at,raw_user_meta_data)
select value::uuid,'fixture-'||value||'@example.invalid',now(),jsonb_build_object('username','guardian_'||replace(value,'-',''))
from jsonb_array_elements_text(jsonb_build_array(current_setting('test.guardian_expired'),current_setting('test.guardian_kept')));
do $$ begin if guardian_helpers.public_allowed(current_setting('test.guardian_expired')::uuid) then raise exception 'New unconfirmed profile exposed'; end if; end; $$;
insert into public.account_age_confirmations(user_id,rule_version,minimum_age,requires_guardian)
select value::uuid,'13-plus-guardian-v1',13,true from jsonb_array_elements_text(jsonb_build_array(current_setting('test.guardian_expired'),current_setting('test.guardian_kept')));
insert into guardian_helpers.requests(user_id,policy_version,status,requested_at,reviewed_at,evidence_reference)
select current_setting('test.guardian_expired')::uuid,version,'revoked',now()-interval '32 days',now()-interval '31 days','fixture-expired' from public.content_policy_versions where active;
insert into guardian_helpers.requests(user_id,policy_version,status,requested_at,reviewed_at,evidence_reference)
select current_setting('test.guardian_kept')::uuid,version,'approved',now()-interval '32 days',now()-interval '31 days','fixture-kept' from public.content_policy_versions where active;
insert into guardian_helpers.reviews(request_id,decision,evidence_reference,reviewed_at)
select request_id,status,evidence_reference,reviewed_at from guardian_helpers.requests where user_id in(current_setting('test.guardian_expired')::uuid,current_setting('test.guardian_kept')::uuid);
select retention_helpers.purge_records();
do $$ begin
 if exists(select 1 from guardian_helpers.requests where user_id=current_setting('test.guardian_expired')::uuid) then raise exception 'Expired request retained'; end if;
 if guardian_helpers.public_allowed(current_setting('test.guardian_expired')::uuid) then raise exception 'Expiry activated account'; end if;
 if not exists(select 1 from guardian_helpers.requests where user_id=current_setting('test.guardian_kept')::uuid and status='approved') then raise exception 'Active consent was purged'; end if;
end; $$;
-- A policy update cannot reuse a previous guardian approval.
insert into public.content_policy_versions(version,terms,content_policy,active)
select 'fixture-'||current_setting('test.guardian_kept'),terms,content_policy,false from public.content_policy_versions where active;
update public.content_policy_versions set active=false where active;
update public.content_policy_versions set active=true where version='fixture-'||current_setting('test.guardian_kept');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.guardian_kept'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare state jsonb; begin
 state:=public.get_account_age_status_v2();
 if state->>'eligible'<>'false' or state->>'guardian_status'<>'not_requested' then raise exception 'Old policy approval reused'; end if;
 state:=public.request_guardian_consent();
 if state->>'eligible'<>'false' or state->>'guardian_status'<>'pending' then raise exception 'New policy review did not remain pending'; end if;
end; $$;
reset role;
select 'Guardian expiry, retained active consent, unconfirmed profile privacy and policy renewal passed' as result;
