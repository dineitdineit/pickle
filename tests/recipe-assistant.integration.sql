-- Synthetic fixtures only. All changes are rolled back.
begin;
select set_config('test.ai_user',gen_random_uuid()::text,true);
select set_config('test.ai_pending',gen_random_uuid()::text,true);
select set_config('test.ai_draft',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data)
select value::uuid,'fixture-'||value||'@example.invalid',jsonb_build_object('username','ai_'||replace(value,'-',''))
from jsonb_array_elements_text(jsonb_build_array(current_setting('test.ai_user'),current_setting('test.ai_pending')));
insert into storage.objects(bucket_id,name) values('community_recipe_images',current_setting('test.ai_user')||'/'||current_setting('test.ai_draft')||'/cover.jpg');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ai_user'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age_v2('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
do $$ declare p jsonb; saved jsonb; rejected boolean; begin
 p:=jsonb_build_object('title','AI rollback fixture','short_description','A quick fried egg.','description','','ingredient_text','1 egg','step_text','Fry the egg',
 'difficulty','Easy','total_time_minutes',5,'servings',1,'cover_image','community:'||auth.uid()::text||'/'||current_setting('test.ai_draft')||'/cover.jpg',
 'ingredients',jsonb_build_array(jsonb_build_object('name','egg','group_name','Ingredients','amount',1,'unit','piece')),
 'steps',jsonb_build_array(jsonb_build_object('instruction','Fry the egg','is_final',true)),'tag_ids','[]'::jsonb,'tag_names','[]'::jsonb,'nutrition',null);
 saved:=public.save_recipe_submission(current_setting('test.ai_draft')::uuid,p,false,null);
 if not exists(select 1 from public.recipe_submissions where id=current_setting('test.ai_draft')::uuid and payload->>'ingredient_text'='1 egg') then raise exception 'Raw draft text was lost'; end if;
 rejected:=false;
 begin perform public.save_recipe_submission(current_setting('test.ai_draft')::uuid,jsonb_set(p,'{short_description}','" "'),true,(saved->>'updated_at')::timestamptz); exception when others then rejected:=true; end;
 if not rejected then raise exception 'Blank short description published'; end if;
 saved:=public.save_recipe_submission(current_setting('test.ai_draft')::uuid,p,true,(saved->>'updated_at')::timestamptz);
 if saved->>'status'<>'published' or not exists(select 1 from public.recipes where id=(saved->>'recipe_id')::uuid and short_description='A quick fried egg.' and coalesce(description,'')='') then raise exception 'Optional About or required summary did not persist'; end if;
 saved:=public.update_recipe_submission(current_setting('test.ai_draft')::uuid,jsonb_set(p,'{short_description}','"Edited short description"'),(saved->>'updated_at')::timestamptz);
 if not exists(select 1 from public.recipes where id=(saved->>'recipe_id')::uuid and short_description='Edited short description') then raise exception 'Owner edit summary failed'; end if;
 if public.reserve_recipe_ai_use()<>'allowed' then raise exception 'Eligible AI request rejected'; end if;
 if public.reserve_recipe_ai_use()<>'rate_limited' then raise exception 'Burst limit bypass'; end if;
 rejected:=false;
 begin perform 1 from private.recipe_ai_usage; exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Private quota exposed'; end if;
end $$;
reset role;
update private.recipe_ai_usage set requests=10,last_used_at=now()-interval '2 minutes' where user_id=current_setting('test.ai_user')::uuid;
set local role authenticated;
do $$ begin if public.reserve_recipe_ai_use()<>'rate_limited' then raise exception 'Daily limit bypass'; end if; end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ai_pending'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if public.reserve_recipe_ai_use()<>'not_allowed' then raise exception 'Age eligibility bypass'; end if; end $$;
reset role;
set local role anon;
do $$ declare rejected boolean:=false; begin
 begin perform public.reserve_recipe_ai_use(); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Anonymous AI quota API exposed'; end if;
end $$;
reset role;
do $$ declare rejected boolean:=false; begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.ai_user'),'role','authenticated','is_anonymous',false)::text,true);
 begin insert into public.recipes(title,short_description,author_id,difficulty,total_time_minutes) values('Invalid direct fixture',' ',auth.uid(),'Easy',5); exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Direct recipe summary constraint bypass'; end if;
 if not exists(select 1 from cron.job where jobname='pickle-recipe-ai-expiry' and active) then raise exception 'Quota expiry job missing'; end if;
end $$;
rollback;
select 'Recipe publish/edit validation, source-text drafts, private quotas, burst/daily limits and age/anonymous guards passed; synthetic changes rolled back.' as result;
