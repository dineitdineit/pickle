-- Execute inside BEGIN / ROLLBACK. No notifications or fixtures are retained.
select set_config('test.a',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.b',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.c',(select id::text from public.profiles order by id offset 2 limit 1),true);
select set_config('test.ra',gen_random_uuid()::text,true);
select set_config('test.rb',gen_random_uuid()::text,true);
select set_config('test.rc',gen_random_uuid()::text,true);
select set_config('test.comment',gen_random_uuid()::text,true);
select set_config('test.review',gen_random_uuid()::text,true);
select set_config('test.notice',gen_random_uuid()::text,true);
select set_config('test.mod',gen_random_uuid()::text,true);
select set_config('test.suppressed',gen_random_uuid()::text,true);
select set_config('test.query',(select left(coalesce(nullif(username,''),display_name),40) from public.profiles where id=current_setting('test.b')::uuid),true);
delete from public.user_blocks where blocker_id in(current_setting('test.a')::uuid,current_setting('test.b')::uuid,current_setting('test.c')::uuid) and blocked_id in(current_setting('test.a')::uuid,current_setting('test.b')::uuid,current_setting('test.c')::uuid);
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id) values
('Fixture recipe summary',current_setting('test.ra')::uuid,'Block A fixture','Easy',10,current_setting('test.a')::uuid),
('Fixture recipe summary',current_setting('test.rb')::uuid,'Block B fixture','Easy',10,current_setting('test.b')::uuid),
('Fixture recipe summary',current_setting('test.rc')::uuid,'Block C fixture','Easy',10,current_setting('test.c')::uuid);
insert into public.recipe_steps(recipe_id,step_number,instruction) values(current_setting('test.rb')::uuid,1,'Private to blocked accounts');
insert into public.recipe_comments(id,recipe_id,user_id,content) values(current_setting('test.comment')::uuid,current_setting('test.rc')::uuid,current_setting('test.b')::uuid,'Blocked author comment');
insert into public.recipe_reviews(id,recipe_id,user_id,rating,content) values(current_setting('test.review')::uuid,current_setting('test.rc')::uuid,current_setting('test.b')::uuid,5,'Blocked author review');
insert into public.recipe_likes(recipe_id,user_id) values(current_setting('test.rb')::uuid,current_setting('test.a')::uuid);
insert into public.saved_recipes(recipe_id,user_id) values(current_setting('test.rb')::uuid,current_setting('test.a')::uuid);
insert into public.user_notifications(id,recipient_id,actor_id,kind,recipe_id) values(current_setting('test.notice')::uuid,current_setting('test.a')::uuid,current_setting('test.b')::uuid,'new_recipe',current_setting('test.rb')::uuid);
insert into public.user_notifications(id,recipient_id,actor_id,kind,moderation_event_id,moderation_details)
values(current_setting('test.mod')::uuid,current_setting('test.a')::uuid,null,'moderation',gen_random_uuid(),jsonb_build_object('target_type','recipe','action','hide','reason','spam','target_id',current_setting('test.ra'),'title','Block A fixture'));
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select set_config('test.version',public.get_safety_version(),true);
select public.set_user_block(current_setting('test.b')::uuid,true);
do $$ declare denied boolean; info jsonb; begin
 if public.get_safety_version()=current_setting('test.version') then raise exception 'Cross-device safety token did not change'; end if;
 if exists(select 1 from public.recipes where id=current_setting('test.rb')::uuid) then raise exception 'Blocked recipe visible'; end if;
 if exists(select 1 from public.recipe_steps where recipe_id=current_setting('test.rb')::uuid) then raise exception 'Child content leaked'; end if;
 if exists(select 1 from public.profiles where id=current_setting('test.b')::uuid) then raise exception 'Full profile leaked'; end if;
 info:=public.get_recipe_author(current_setting('test.b')::uuid);
 if info->>'id'<>current_setting('test.b') or info->>'bio' is not null or info->>'following'<>'false' or info->>'post_count'<>'0' then raise exception 'Restricted profile failed'; end if;
 if public.get_profile_popular_recipes(current_setting('test.b')::uuid)<>'[]'::jsonb then raise exception 'Popular recipes leaked'; end if;
 if exists(select 1 from jsonb_array_elements(public.get_search_suggestions(current_setting('test.query'))->'users') u where u->>'id'=current_setting('test.b')) or exists(select 1 from jsonb_array_elements(public.search_ranked_users(current_setting('test.query'),0)->'users') u where u->>'id'=current_setting('test.b')) then raise exception 'Search leaked blocked account'; end if;
 if not exists(select 1 from jsonb_array_elements(public.list_blocked_users()) b where b->>'blocked_id'=current_setting('test.b') and b->'profile'->>'id'=current_setting('test.b')) then raise exception 'Block list identity lost'; end if;
 if exists(select 1 from public.recipe_comments where id=current_setting('test.comment')::uuid) or exists(select 1 from public.recipe_reviews where id=current_setting('test.review')::uuid) then raise exception 'Blocked comments/reviews visible'; end if;
 if (select rating_count from public.recipe_rating_summary(current_setting('test.rc')::uuid))<>1 then raise exception 'Personal block changed global ratings'; end if;
 if exists(select 1 from public.saved_recipes where recipe_id=current_setting('test.rb')::uuid) or exists(select 1 from public.recipe_likes where recipe_id=current_setting('test.rb')::uuid) then raise exception 'Blocked saved/liked visible'; end if;
 if exists(select 1 from public.user_notifications where id=current_setting('test.notice')::uuid) then raise exception 'Social notice visible'; end if;
 if not exists(select 1 from public.user_notifications where id=current_setting('test.mod')::uuid) then raise exception 'Moderation notice suppressed'; end if;
 denied:=false;
 begin insert into public.recipe_comments(recipe_id,user_id,content) values(current_setting('test.rb')::uuid,auth.uid(),'Forbidden'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Comment bypass'; end if;
 denied:=false;
 begin insert into public.recipe_reviews(recipe_id,user_id,rating,content) values(current_setting('test.rb')::uuid,auth.uid(),1,'Forbidden'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Review bypass'; end if;
 denied:=false;
 begin insert into public.recipe_comments(recipe_id,user_id,parent_comment_id,content) values(current_setting('test.rc')::uuid,auth.uid(),current_setting('test.comment')::uuid,'Forbidden reply'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Reply bypass'; end if;
 denied:=false;
 begin insert into public.recipe_likes(recipe_id,user_id) values(current_setting('test.rb')::uuid,auth.uid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Like bypass'; end if;
 denied:=false;
 begin insert into public.saved_recipes(recipe_id,user_id) values(current_setting('test.rb')::uuid,auth.uid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Save bypass'; end if;
 denied:=false;
 begin insert into public.comment_likes(comment_id,user_id) values(current_setting('test.comment')::uuid,auth.uid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Comment like bypass'; end if;
 perform public.submit_content_report('user',current_setting('test.b')::uuid,'spam',null);
 perform public.submit_content_report('recipe',current_setting('test.rb')::uuid,'spam',null);
 perform public.submit_content_report('review',current_setting('test.review')::uuid,'spam',null);
 perform public.submit_comment_report(current_setting('test.comment')::uuid,'spam',null);
 -- Unrelated interactions still work.
 insert into public.saved_recipes(recipe_id,user_id) values(current_setting('test.rc')::uuid,auth.uid());
 insert into public.recipe_likes(recipe_id,user_id) values(current_setting('test.rc')::uuid,auth.uid());
end; $$;
reset role;
insert into public.user_notifications(id,recipient_id,actor_id,kind,recipe_id) values(current_setting('test.suppressed')::uuid,current_setting('test.b')::uuid,current_setting('test.a')::uuid,'new_recipe',current_setting('test.ra')::uuid);
do $$ begin if exists(select 1 from public.user_notifications where id=current_setting('test.suppressed')::uuid) then raise exception 'New social notice was created'; end if; end; $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.b'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if exists(select 1 from public.recipes where id=current_setting('test.ra')::uuid) then raise exception 'Reverse content block failed'; end if;
 perform public.set_user_block(current_setting('test.a')::uuid,true);
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','is_anonymous',false)::text,true);
select public.set_user_block(current_setting('test.b')::uuid,false);
do $$ begin if exists(select 1 from public.recipes where id=current_setting('test.rb')::uuid) then raise exception 'Reverse block removed by unblock'; end if; end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.b'),'role','authenticated','is_anonymous',false)::text,true);
select public.set_user_block(current_setting('test.a')::uuid,false);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.a'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if not exists(select 1 from public.recipes where id=current_setting('test.rb')::uuid) or not exists(select 1 from public.saved_recipes where recipe_id=current_setting('test.rb')::uuid) or not exists(select 1 from public.recipe_likes where recipe_id=current_setting('test.rb')::uuid) then raise exception 'Retained content did not restore'; end if;
 if not exists(select 1 from public.user_notifications where id=current_setting('test.notice')::uuid) then raise exception 'Notice was deleted'; end if;
 if not exists(select 1 from public.recipe_comments where id=current_setting('test.comment')::uuid) then raise exception 'Comment history lost'; end if;
end; $$;
select public.set_user_block(current_setting('test.b')::uuid,true);
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$ begin
 if not exists(select 1 from public.recipes where id=current_setting('test.rb')::uuid) then raise exception 'Logged-out public access broken'; end if;
end; $$;
reset role;
select 'Bilateral content, child content, restricted profiles, retained saves/likes/notices, aggregate ratings, interaction/reply denial, reports and guest access passed' as result;
