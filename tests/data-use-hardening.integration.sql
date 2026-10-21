-- Run only inside BEGIN/ROLLBACK; all identities and Storage metadata are synthetic.
select set_config('test.media_a',gen_random_uuid()::text,true);
select set_config('test.media_b',gen_random_uuid()::text,true);
select set_config('test.media_sid',gen_random_uuid()::text,true);
select set_config('test.media_rid',gen_random_uuid()::text,true);
select set_config('test.media_path',current_setting('test.media_a')||'/'||current_setting('test.media_sid')||'/'||gen_random_uuid()::text||'.webp',true);
insert into auth.users(id,email,raw_user_meta_data)
select current_setting('test.'||key)::uuid,'fixture-'||current_setting('test.'||key)||'@example.invalid',jsonb_build_object('username','fixture_'||replace(current_setting('test.'||key),'-','')) from unnest(array['media_a','media_b']) key;
insert into storage.objects(bucket_id,name) values('community_recipe_images',current_setting('test.media_path'));
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.media_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
do $$ begin
 if not media_helpers.can_read_photo(current_setting('test.media_path')) then raise exception 'Owner cannot preview draft'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare denied boolean:=false; begin
 if media_helpers.can_read_photo(current_setting('test.media_path')) then raise exception 'Draft photo publicly readable'; end if;
 begin perform * from public.recipe_views; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Raw view events exposed'; end if;
end; $$;
reset role;
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id,cover_image) values('Fixture recipe summary',current_setting('test.media_rid')::uuid,'Synthetic privacy test','Easy',10,current_setting('test.media_a')::uuid,'community:'||current_setting('test.media_path'));
insert into public.recipe_views(recipe_id) values(current_setting('test.media_rid')::uuid);
set local role anon;
do $$ begin
 if not media_helpers.can_read_photo(current_setting('test.media_path')) then raise exception 'Published photo inaccessible'; end if;
 if (select view_count from public.get_recipe_view_counts() where recipe_id=current_setting('test.media_rid')::uuid)<>1 then raise exception 'Aggregate count wrong'; end if;
end; $$;
reset role;
update public.recipes set is_hidden=true where id=current_setting('test.media_rid')::uuid;
set local role anon;
do $$ begin if media_helpers.can_read_photo(current_setting('test.media_path')) then raise exception 'Hidden photo exposed'; end if; end; $$;
reset role;
delete from public.recipes where id=current_setting('test.media_rid')::uuid;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.media_claim',public.recipe_asset_worker('claim',jsonb_build_object('path',current_setting('test.media_path')))::text,true);
do $$ begin
 if current_setting('test.media_claim')::jsonb->>'path' is distinct from current_setting('test.media_path') then raise exception 'Unreferenced deletion not claimed'; end if;
 if public.recipe_asset_worker('ack',current_setting('test.media_claim')::jsonb)<>'false'::jsonb then raise exception 'Acknowledged before storage removal'; end if;
end; $$;
reset role;
do $$ declare denied boolean:=false; begin
 begin insert into public.recipes(short_description,title,difficulty,total_time_minutes,author_id,cover_image) values('Fixture recipe summary','Cannot resurrect deleting photo','Easy',10,current_setting('test.media_a')::uuid,'community:'||current_setting('test.media_path')); exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Deletion/save race allowed'; end if;
end; $$;
-- Do not delete even fixture Storage metadata through SQL. Byte removal/ack and
-- retries are exercised through a Storage-API test double in the worker tests.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.media_a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.set_user_follow(current_setting('test.media_b')::uuid,true);
select public.set_author_recipe_notifications(current_setting('test.media_b')::uuid,true);
do $$ declare denied boolean:=false; begin
 if public.get_recipe_author(current_setting('test.media_b')::uuid)->>'notifications_enabled'<>'true' then raise exception 'Own alert setting unavailable'; end if;
 begin perform notify_new_recipes from public.user_follows; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Alert choice directly readable'; end if;
 denied:=false; begin perform public.recipe_asset_worker('claim'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Client accessed cleanup worker'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
select set_config('test.keyword','privacy fixture '||translate(substr(replace(gen_random_uuid()::text,'-',''),1,12),'0123456789','abcdefghij'),true);
insert into public.tags(name,category) values(current_setting('test.keyword'),'community');
-- Keep synthetic searcher IDs in a transaction-local temporary table.
create temporary table privacy_searchers(id uuid) on commit drop;
with fixtures as (
 insert into auth.users(id,email,raw_user_meta_data)
 select gen_random_uuid(),'fixture-'||gen_random_uuid()||'@example.invalid',jsonb_build_object('username','fixture_'||replace(gen_random_uuid()::text,'-','')) from generate_series(1,5) returning id
) insert into privacy_searchers select id from fixtures;
insert into public.search_events(user_id,query,normalized_query,result_count)
select current_setting('test.media_a')::uuid,current_setting('test.keyword'),current_setting('test.keyword'),1 from generate_series(1,5);
do $$ begin
 if (public.get_search_suggestions(current_setting('test.keyword'))->'keywords')<>'[]'::jsonb then raise exception 'One searcher exposed a keyword'; end if;
end; $$;
insert into public.search_events(user_id,query,normalized_query,result_count)
select id,current_setting('test.keyword'),current_setting('test.keyword'),1 from privacy_searchers;
do $$ begin
 if jsonb_array_length(public.get_search_suggestions(current_setting('test.keyword'))->'keywords')<>1 then raise exception 'Distinct-searcher public keyword missing'; end if;
end; $$;
select 'Private draft/published/hidden media, durable cleanup, race guard, aggregate counts and private alert choices passed' as result;
