-- Run in BEGIN / ROLLBACK. Fixtures and user preferences are restored afterward.
select set_config('test.viewer',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.author',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.submission',gen_random_uuid()::text,true);
select set_config('test.submission_off',gen_random_uuid()::text,true);
insert into storage.objects(bucket_id,name) values
('community_recipe_images',current_setting('test.author')||'/'||current_setting('test.submission')||'/cover.jpg'),
('community_recipe_images',current_setting('test.author')||'/'||current_setting('test.submission_off')||'/cover.jpg');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.viewer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.set_user_follow(current_setting('test.author')::uuid,true);
select public.set_author_recipe_notifications(current_setting('test.author')::uuid,true);
do $$ declare a jsonb; begin
  a:=public.get_recipe_author(current_setting('test.author')::uuid);
  if a->>'following'<>'true' or a->>'notifications_enabled'<>'true' or (a->>'follower_count')::int<1 then raise exception 'Author card state is wrong'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.author'),'role','authenticated','is_anonymous',false)::text,true);
do $$
declare sid uuid:=current_setting('test.submission')::uuid; p jsonb; saved jsonb; blocked boolean:=false;
begin
  begin perform public.set_author_recipe_notifications(current_setting('test.author')::uuid,true); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Notification settings accepted without following'; end if;
  p:=jsonb_build_object('short_description','Fixture recipe summary','title','Notification fixture','description','Recipe description','difficulty','Easy','total_time_minutes',20,'servings',2,'cover_image','community:'||auth.uid()::text||'/'||sid::text||'/cover.jpg','ingredients',jsonb_build_array(jsonb_build_object('name','Water','group_name','Main','amount',500,'unit','ml')),'steps',jsonb_build_array(jsonb_build_object('instruction','Boil','is_final',true)),'tag_ids','[]'::jsonb,'tag_names','[]'::jsonb,'nutrition',null);
  saved:=public.save_recipe_submission(sid,p,false,null);
  perform set_config('test.draft_version',saved->>'updated_at',true);
  perform set_config('test.payload',p::text,true);
end; $$;
reset role;
do $$ begin
  if exists(select 1 from public.user_notifications where recipe_id in (select published_recipe_id from public.recipe_submissions where id=current_setting('test.submission')::uuid)) then raise exception 'Draft created alerts'; end if;
end; $$;
set local role authenticated;
do $$ declare saved jsonb; begin
  saved:=public.save_recipe_submission(current_setting('test.submission')::uuid,current_setting('test.payload')::jsonb,true,current_setting('test.draft_version')::timestamptz);
  perform set_config('test.recipe',saved->>'recipe_id',true);
  perform public.update_recipe_submission(current_setting('test.submission')::uuid,jsonb_set(current_setting('test.payload')::jsonb,'{title}','"Edited notification fixture"'),(saved->>'updated_at')::timestamptz);
end; $$;
reset role;
do $$ begin
  if (select count(*) from public.user_notifications where recipient_id=current_setting('test.viewer')::uuid and recipe_id=current_setting('test.recipe')::uuid and kind='new_recipe')<>1 then raise exception 'Publication did not send one alert or editing sent duplicates'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.viewer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.set_author_recipe_notifications(current_setting('test.author')::uuid,false);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.author'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare p jsonb; saved jsonb; begin
  p:=jsonb_set(current_setting('test.payload')::jsonb,'{cover_image}',to_jsonb('community:'||auth.uid()::text||'/'||current_setting('test.submission_off')||'/cover.jpg'));
  saved:=public.save_recipe_submission(current_setting('test.submission_off')::uuid,p,true,null);
  perform set_config('test.recipe_off',saved->>'recipe_id',true);
end; $$;
reset role;
do $$ begin
  if exists(select 1 from public.user_notifications where recipient_id=current_setting('test.viewer')::uuid and recipe_id=current_setting('test.recipe_off')::uuid) then raise exception 'Disabled subscription received new recipe alert'; end if;
end; $$;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ declare a jsonb; begin
  a:=public.get_recipe_author(current_setting('test.author')::uuid);
  if a->>'following'<>'false' or a->>'notifications_enabled'<>'false' or (a->>'follower_count')::int<1 then raise exception 'Public author aggregate is wrong'; end if;
end; $$;
reset role;
select 'Author follower count, subscription on/off, draft silence, first-publication alert, edit deduplication and public aggregate passed.' as result;
