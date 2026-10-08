-- Run against Supabase using execute_sql. All fixtures are rolled back.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles limit 1),'role','authenticated','is_anonymous',false)::text,true);
select set_config('test.submission_id',gen_random_uuid()::text,true);
select set_config('test.tag_id',(select id::text from public.tags limit 1),true);
select set_config('test.cover_image','community:'||auth.uid()::text||'/'||current_setting('test.submission_id')||'/cover.jpg',true);
insert into storage.objects(bucket_id,name) values('community_recipe_images',substr(current_setting('test.cover_image'),11));
set local role authenticated;
do $$
declare sid uuid:=current_setting('test.submission_id')::uuid; p jsonb; saved jsonb; published jsonb; rid uuid; version timestamptz; blocked boolean; field text;
begin
  if auth.uid() is null then raise exception 'Test needs an existing user profile'; end if;

  p:='{"title":"Upload integration test","difficulty":"Easy","total_time_minutes":20,"servings":2,"description":"Integration soup recipe","ingredients":[{"name":"Water","group_name":"Ingredients","amount":500,"unit":"ml","optional":false},{"name":"Salt","group_name":"Seasoning","amount":0.5,"unit":"tsp","metric_amount":2,"metric_unit":"g","optional":true,"substitute":"Pepper"}],"steps":[{"instruction":"Boil water","step_time_minutes":5},{"instruction":"Season","is_final":true}],"tag_ids":[],"nutrition":{"calories":0,"protein_g":0,"carbs_g":0,"fat_g":0,"is_estimated":true}}';
  p:=jsonb_set(p,'{video_url}',to_jsonb('https://youtu.be/abcdefghijk'::text));
  p:=jsonb_set(p,'{cover_image}',to_jsonb(current_setting('test.cover_image')));
  p:=jsonb_set(p,'{finished_image}',to_jsonb(current_setting('test.cover_image')));
  p:=jsonb_set(p,'{tag_names}',jsonb_build_array('test-'||left(sid::text,8),'TEST-'||left(sid::text,8)));

  blocked:=false;
  begin perform public.save_recipe_submission(sid,jsonb_set(p,'{video_url}','"javascript:alert(1)"'),false,null); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Unsafe video URL accepted'; end if;
  foreach field in array array['https://vimeo.com/123456','https://example.com/video.mp4','https://youtube.com.evil.com/watch?v=abcdefghijk','https://www.instagram.com/profile/'] loop
    blocked:=false;
    begin perform public.save_recipe_submission(sid,jsonb_set(p,'{video_url}',to_jsonb(field)),false,null); exception when others then
      if sqlerrm not like '%Only YouTube and Instagram%' then raise; end if;
      blocked:=true;
    end;
    if not blocked then raise exception 'Unsupported platform accepted: %',field; end if;
  end loop;
  perform public.save_recipe_submission(gen_random_uuid(),jsonb_set(p-'cover_image'-'finished_image','{video_url}',to_jsonb('https://www.instagram.com/reel/ABC123/?igsh=abc'::text)),false,null);

  p:=jsonb_set(p,'{tag_ids}',jsonb_build_array(current_setting('test.tag_id'),current_setting('test.tag_id')));
  saved:=public.save_recipe_submission(sid,jsonb_set(jsonb_set(p-'cover_image'-'description'-'servings','{ingredients,0,amount}','null'::jsonb),'{ingredients,0,unit}','null'::jsonb),false,null);
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
  blocked:=false;
  begin perform public.save_recipe_submission(sid,jsonb_set(p,'{finished_image}','"community:another-user/final.jpg"'),false,version); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Foreign finished photo accepted'; end if;
  blocked:=false;
  begin perform public.save_recipe_submission(sid,jsonb_set(p,'{tag_names}','[""]'),false,version); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Blank custom tag accepted'; end if;
  foreach field in array array['cover_image','description','servings'] loop
    blocked:=false;
    begin perform public.save_recipe_submission(sid,p-field,true,version); exception when others then blocked:=true; end;
    if not blocked then raise exception 'Missing % accepted',field; end if;
  end loop;
  foreach field in array array['amount','unit'] loop
    blocked:=false;
    begin perform public.save_recipe_submission(sid,jsonb_set(p,array['ingredients','0',field],'null'::jsonb),true,version); exception when others then blocked:=true; end;
    if not blocked then raise exception 'Missing ingredient % accepted',field; end if;
  end loop;
  published:=public.save_recipe_submission(sid,p,true,version);rid:=(published->>'recipe_id')::uuid;
  if (select video_url from public.recipes where id=rid) is distinct from 'https://youtu.be/abcdefghijk' then raise exception 'Published video missing'; end if;
  if published->>'status'<>'published' or rid is null then raise exception 'Publish failed'; end if;
  if not exists(select 1 from public.recipes where id=rid and author_id=auth.uid() and servings=2 and total_time_minutes=20 and finished_image=current_setting('test.cover_image')) then raise exception 'Recipe mapping failed'; end if;
  if (select count(*) from public.recipe_ingredients where recipe_id=rid)<>2 or not exists(select 1 from public.recipe_ingredients where recipe_id=rid and amount=500 and unit='ml' and group_name='Ingredients') then raise exception 'Ingredient mapping failed'; end if;
  if not exists(select 1 from public.recipe_ingredients where recipe_id=rid and optional and amount=0.5 and metric_amount=2 and display_order=1) then raise exception 'Ingredient options lost'; end if;
  if (select count(*) from public.recipe_steps where recipe_id=rid)<>2 or not exists(select 1 from public.recipe_steps where recipe_id=rid and step_number=2 and is_final) then raise exception 'Step ordering failed'; end if;
  if (select count(*) from public.recipe_tags where recipe_id=rid)<>2 then raise exception 'Tags not deduplicated'; end if;
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
