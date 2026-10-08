-- Run against Supabase using execute_sql. All fixtures are rolled back.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles limit 1),'role','authenticated','is_anonymous',false)::text,true);
select set_config('test.submission_id',gen_random_uuid()::text,true);
select set_config('test.tag_id',(select id::text from public.tags limit 1),true);
set local role authenticated;
do $$
declare sid uuid:=current_setting('test.submission_id')::uuid; p jsonb; saved jsonb; published jsonb; rid uuid; version timestamptz; blocked boolean;
begin
  if auth.uid() is null then raise exception 'Test needs an existing user profile'; end if;
  p:='{"title":"Upload integration test","difficulty":"Easy","total_time_minutes":20,"servings":null,"ingredients":[{"name":"Water","group_name":"Ingredients","amount":null,"unit":"","optional":false},{"name":"Salt","group_name":"Seasoning","amount":0.5,"unit":"tsp","metric_amount":2,"metric_unit":"g","optional":true,"substitute":"Pepper"}],"steps":[{"instruction":"Boil water","step_time_minutes":5},{"instruction":"Season","is_final":true}],"tag_ids":[],"nutrition":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"is_estimated":true}}';
  p:=jsonb_set(p,'{tag_ids}',jsonb_build_array(current_setting('test.tag_id'),current_setting('test.tag_id')));
  saved:=public.save_recipe_submission(sid,p,false,null);
  version:=(saved->>'updated_at')::timestamptz;
  if saved->>'status'<>'draft' or not exists(select 1 from public.recipe_submissions where id=sid) then raise exception 'Draft save failed'; end if;
  blocked:=false;
  begin perform public.save_recipe_submission(sid,p,false,version-interval '1 second'); exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'Stale version accepted'; end if;
  blocked:=false;
  begin perform public.save_recipe_submission(gen_random_uuid(),jsonb_set(p,'{title}','""'),true,null); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Incomplete recipe published'; end if;
  blocked:=false;
  begin perform public.save_recipe_submission(sid,jsonb_set(p,'{cover_image}','"community:another-user/photo.jpg"'),false,version); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Foreign image accepted'; end if;
  published:=public.save_recipe_submission(sid,p,true,version);rid:=(published->>'recipe_id')::uuid;
  if published->>'status'<>'published' or rid is null then raise exception 'Publish failed'; end if;
  if not exists(select 1 from public.recipes where id=rid and author_id=auth.uid() and servings is null and total_time_minutes=20) then raise exception 'Recipe mapping failed'; end if;
  if (select count(*) from public.recipe_ingredients where recipe_id=rid)<>2 or not exists(select 1 from public.recipe_ingredients where recipe_id=rid and amount is null and group_name='Ingredients') then raise exception 'Ingredient mapping failed'; end if;
  if not exists(select 1 from public.recipe_ingredients where recipe_id=rid and optional and amount=0.5 and metric_amount=2 and display_order=1) then raise exception 'Ingredient options lost'; end if;
  if (select count(*) from public.recipe_steps where recipe_id=rid)<>2 or not exists(select 1 from public.recipe_steps where recipe_id=rid and step_number=2 and is_final) then raise exception 'Step ordering failed'; end if;
  if (select count(*) from public.recipe_tags where recipe_id=rid)<>1 then raise exception 'Tags not deduplicated'; end if;
  if not exists(select 1 from public.recipe_nutrition where recipe_id=rid and calories=0) then raise exception 'Nutrition mapping failed'; end if;
  if public.save_recipe_submission(sid,p,true,version)->>'recipe_id'<>rid::text then raise exception 'Duplicate publish created a recipe'; end if;
  perform set_config('test.recipe_id',rid::text,true);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare blocked boolean:=false; begin
  if exists(select 1 from public.recipe_submissions where id=current_setting('test.submission_id')::uuid) then raise exception 'Other user can read a draft'; end if;
  begin perform public.save_recipe_submission(current_setting('test.submission_id')::uuid,(select '{}'::jsonb),false,null); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Other user can overwrite a draft'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare blocked boolean:=false; begin
  if not exists(select 1 from public.recipes where id=current_setting('test.recipe_id')::uuid) then raise exception 'Published recipe not public'; end if;
  begin perform public.save_recipe_submission(gen_random_uuid(),'{}',false,null); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Logged-out upload allowed'; end if;
end $$;
reset role;
rollback;
select 'Draft, publish, relations, privacy, stale-save, ownership, image ownership, duplicate publish, and signed-out checks passed; fixtures rolled back.' as result;
