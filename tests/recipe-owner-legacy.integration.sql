-- Execute inside BEGIN / ROLLBACK. No published user data is changed.
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles limit 1),'role','authenticated','is_anonymous',false)::text,true);
select set_config('test.legacy_submission',gen_random_uuid()::text,true);
select set_config('test.legacy_recipe',gen_random_uuid()::text,true);
insert into public.recipes(short_description,id,author_id,title,difficulty,total_time_minutes,servings,cover_image)
values('Fixture recipe summary',current_setting('test.legacy_recipe')::uuid,auth.uid(),'Legacy fixture','Easy',20,2,'legacy-owner-test.jpg');
insert into public.recipe_submissions(id,user_id,status,published_recipe_id,payload)
values(current_setting('test.legacy_submission')::uuid,auth.uid(),'published',current_setting('test.legacy_recipe')::uuid,
jsonb_build_object('short_description','Fixture recipe summary','title','Legacy fixture','description','Legacy description','difficulty','Easy','total_time_minutes',20,'servings',2,'cover_image','legacy-owner-test.jpg','ingredients',jsonb_build_array(jsonb_build_object('name','Water','group_name','Main','amount',500,'unit','ml')),'steps',jsonb_build_array(jsonb_build_object('instruction','Boil','is_final',true)),'tag_ids','[]'::jsonb,'tag_names','[]'::jsonb,'nutrition',null));
set local role authenticated;
do $$
declare row public.recipe_submissions; changed jsonb; blocked boolean:=false;
begin
  select * into row from public.recipe_submissions where id=current_setting('test.legacy_submission')::uuid;
  begin perform public.update_recipe_submission(row.id,jsonb_set(row.payload,'{cover_image}','"another-legacy-photo.jpg"'),row.updated_at); exception when others then blocked:=true; end;
  if not blocked then raise exception 'New legacy photo bypassed upload ownership'; end if;
  changed:=public.update_recipe_submission(row.id,jsonb_set(row.payload,'{title}','"Updated legacy fixture"'),row.updated_at);
  if (select cover_image from public.recipes where id=row.published_recipe_id)<>'legacy-owner-test.jpg' then raise exception 'Original legacy photo was lost'; end if;
  if (changed->>'recipe_id')::uuid<>row.published_recipe_id then raise exception 'Legacy recipe ID changed'; end if;
  perform public.delete_recipe_submission(row.id,(changed->>'updated_at')::timestamptz);
  if exists(select 1 from public.recipes where id=row.published_recipe_id) then raise exception 'Legacy deletion failed'; end if;
end;
$$;
reset role;
select 'Legacy photo preservation, replacement ownership and recipe deletion passed.' as result;
