-- Execute inside BEGIN / ROLLBACK. Existing profile IDs are fixture identities only.
select set_config('test.a',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.b',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.recipe',gen_random_uuid()::text,true);
select set_config('test.comment',gen_random_uuid()::text,true);
select set_config('test.review',gen_random_uuid()::text,true);
select set_config('test.version',(select version from public.content_policy_versions where active),true);
select set_config('test.submission',gen_random_uuid()::text,true);
select set_config('test.payload',jsonb_build_object('short_description','Fixture recipe summary','title','Consent publish fixture','description','Boil water safely','difficulty','Easy','total_time_minutes',10,'servings',2,'cover_image','community:'||current_setting('test.a')||'/'||current_setting('test.submission')||'/cover.jpg','ingredients',jsonb_build_array(jsonb_build_object('name','Water','group_name','Main','amount',500,'unit','ml')),'steps',jsonb_build_array(jsonb_build_object('instruction','Boil','is_final',true)),'tag_ids','[]'::jsonb,'tag_names','[]'::jsonb,'nutrition',null)::text,true);
insert into storage.objects(bucket_id,name) values('community_recipe_images',current_setting('test.a')||'/'||current_setting('test.submission')||'/cover.jpg');
delete from public.user_content_consents where user_id in(current_setting('test.a')::uuid,current_setting('test.b')::uuid);
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id) values('Fixture recipe summary',current_setting('test.recipe')::uuid,'Consent rollback fixture','Easy',10,current_setting('test.b')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare denied boolean; state jsonb; new_review uuid; draft jsonb; published jsonb; begin
 state:=public.get_content_policy_state();
 if state->>'user_id'<>current_setting('test.a') or state->>'accepted'<>'false' or jsonb_array_length(state->'terms')<>11 or jsonb_array_length(state->'content_policy')<5 then raise exception 'Policy snapshot invalid'; end if;
 draft:=public.save_recipe_submission(current_setting('test.submission')::uuid,current_setting('test.payload')::jsonb,false,null);
 if draft->>'status'<>'draft' then raise exception 'Private draft requires consent'; end if;
 denied:=false;
 begin perform public.save_recipe_submission(current_setting('test.submission')::uuid,current_setting('test.payload')::jsonb,true,(draft->>'updated_at')::timestamptz); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Publication consent bypass'; end if;
 denied:=false;
 begin insert into public.recipe_comments(recipe_id,user_id,content) values(current_setting('test.recipe')::uuid,auth.uid(),'No agreement'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Comment consent bypass'; end if;
 denied:=false;
 begin insert into public.recipe_reviews(recipe_id,user_id,rating,content) values(current_setting('test.recipe')::uuid,auth.uid(),5,''); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Rating-only consent bypass'; end if;
 denied:=false;
 begin perform public.accept_content_policy(current_setting('test.version'),true,false); exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'Partial agreement accepted'; end if;
 denied:=false;
 begin perform public.accept_content_policy('outdated',true,true); exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Outdated agreement accepted'; end if;
 denied:=false;
 begin insert into public.user_content_consents(user_id,policy_version) values(current_setting('test.b')::uuid,current_setting('test.version')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Forged consent accepted'; end if;
 denied:=false;
 begin insert into storage.objects(bucket_id,name) values('community_recipe_images',auth.uid()::text||'/consent-fixture/no-agreement.jpg'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Photo consent bypass'; end if;
 state:=public.accept_content_policy(current_setting('test.version'),true,true);
 if state->>'accepted'<>'true' or state->>'user_id'<>current_setting('test.a') then raise exception 'Acceptance confirmation failed'; end if;
 perform public.accept_content_policy(current_setting('test.version'),true,true);
 if (select count(*) from public.user_content_consents)<>1 then raise exception 'Duplicate consent or leaked records'; end if;
 published:=public.save_recipe_submission(current_setting('test.submission')::uuid,current_setting('test.payload')::jsonb,true,(draft->>'updated_at')::timestamptz);
 if published->>'status'<>'published' or published->>'recipe_id' is null then raise exception 'Consented publication failed'; end if;
 insert into public.recipe_comments(id,recipe_id,user_id,content) values(current_setting('test.comment')::uuid,current_setting('test.recipe')::uuid,auth.uid(),'Agreed comment');
 insert into public.recipe_reviews(recipe_id,user_id,rating,content) values(current_setting('test.recipe')::uuid,auth.uid(),5,'Agreed review') returning id into new_review;
 perform set_config('test.review',new_review::text,true);
 update public.recipe_comments set content='Agreed edit' where id=current_setting('test.comment')::uuid;
 update public.recipe_reviews set rating=4 where id=current_setting('test.review')::uuid;
 insert into storage.objects(bucket_id,name) values('community_recipe_images',auth.uid()::text||'/consent-fixture/agreed.jpg');
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.b'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if (public.get_content_policy_state()->>'accepted')<>'false' or exists(select 1 from public.user_content_consents) then raise exception 'Another account inherited consent'; end if;
end; $$;
reset role;
-- Rotate to a fixture policy version without changing any already accepted text.
update public.content_policy_versions set active=false where active;
insert into public.content_policy_versions(version,terms,content_policy,active)
select 'fixture-'||gen_random_uuid()::text,terms,content_policy,true from public.content_policy_versions where version=current_setting('test.version');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare denied boolean; begin
 if (public.get_content_policy_state()->>'accepted')<>'false' then raise exception 'Policy update did not require consent'; end if;
 denied:=false;
 begin perform public.update_recipe_submission(current_setting('test.submission')::uuid,current_setting('test.payload')::jsonb,(select updated_at from public.recipe_submissions where id=current_setting('test.submission')::uuid)); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Published edit bypassed renewal'; end if;
 denied:=false;
 begin update public.recipe_comments set content='Unagreed edit' where id=current_setting('test.comment')::uuid; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Comment edit bypassed renewal'; end if;
 denied:=false;
 begin update public.recipe_reviews set rating=3 where id=current_setting('test.review')::uuid; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Review edit bypassed renewal'; end if;
 -- Deleting existing content remains possible without renewed consent.
 delete from public.recipe_comments where id=current_setting('test.comment')::uuid;
 delete from public.recipe_reviews where id=current_setting('test.review')::uuid;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','is_anonymous',true)::text,true);
do $$ declare denied boolean:=false; begin
 begin perform public.get_content_policy_state(); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Anonymous consent permitted'; end if;
end; $$;
reset role;
select 'Explicit dual agreement, private/idempotent records, ratings/comments/photo gates, policy renewal, delete access and account/anonymous isolation passed' as result;
