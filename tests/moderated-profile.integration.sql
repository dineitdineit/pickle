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
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select set_config('test.visibility',public.get_public_visibility_version(),true);
select public.submit_content_report('user',current_setting('test.subject')::uuid,'harassment','Profile harassment fixture evidence');
reset role;
select set_config('test.profile_case',(select id::text from public.moderation_cases where target_type='user' and target_id=current_setting('test.subject')::uuid and status<>'closed'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare c public.moderation_cases; d jsonb; begin
 select * into c from public.moderation_cases where id=current_setting('test.profile_case')::uuid;
 perform public.triage_moderation_case(c.id,c.updated_at,auth.uid(),'normal','Specific profile content and context reviewed.');
 select * into c from public.moderation_cases where id=c.id;
 d:=public.decide_moderation_case(c.id,c.updated_at,'hide','minor','harassment','Harassing profile content violates the policy.','Internal profile content evidence and rationale.','warning');
 perform set_config('test.profile_decision',d->>'id',true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare masked jsonb; begin
 if exists(select 1 from public.profiles where id=current_setting('test.subject')::uuid) then raise exception 'Hidden profile leaked through RLS'; end if;
 masked:=author_profile_helpers.get_recipe_author(current_setting('test.subject')::uuid);
 if masked->>'display_name'<>'Unavailable account' or masked->>'avatar_url' is not null then raise exception 'Author identity not masked'; end if;
 if (blocking_helpers.get_block_state(current_setting('test.subject')::uuid)->>'can_contact')<>'false' then raise exception 'Hidden profile contact exposed'; end if;
 if public.get_public_visibility_version()=current_setting('test.visibility') then raise exception 'Public visibility cache not invalidated'; end if;
end; $$;
reset role;
select set_config('test.username',coalesce((select username from public.profiles where id=current_setting('test.subject')::uuid),'fixture'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from jsonb_array_elements(search_suggestion_helpers.search_ranked_users(current_setting('test.username'))->'users') u where u->>'id'=current_setting('test.subject')) then raise exception 'Search exposes hidden profile'; end if;
 if exists(select 1 from jsonb_array_elements(search_suggestion_helpers.get_search_suggestions(current_setting('test.username'))->'users') u where u->>'id'=current_setting('test.subject')) then raise exception 'Suggestions expose hidden profile'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.subject'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare denied boolean:=false; begin
 begin update public.profiles set moderation_hidden=false where id=auth.uid(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Owner bypassed profile moderation'; end if;
 perform set_config('test.profile_appeal',public.submit_moderation_appeal(current_setting('test.profile_decision')::uuid,'Please review the context of my profile content again.')->>'id',true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.operator'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 perform public.review_moderation_appeal(current_setting('test.profile_appeal')::uuid,'overturned','The profile finding was mistaken in context.','Independent context re-review within fixture.');
 if exists(select 1 from public.profiles where id=current_setting('test.subject')::uuid and moderation_hidden) then raise exception 'Appeal did not restore profile'; end if;
end; $$;
reset role;
select 'Profile masking, search visibility, contact control, cache invalidation, owner bypass denial and appeal restoration passed' as result;
