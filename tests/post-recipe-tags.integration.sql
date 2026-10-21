-- Synthetic users and Storage metadata only. No files or emails. Always rollback.
begin;
create temp table tag_fixture(label text primary key,id uuid default gen_random_uuid());
insert into tag_fixture(label) values('creator'),('cook'),('other'),('recipe'),('hidden'),('post'),('failed'),('muted');
grant select on tag_fixture to authenticated;
insert into auth.users(id,email,raw_user_meta_data)
select id,'fixture-'||id||'@example.invalid',jsonb_build_object('username','tag_'||replace(id::text,'-','')) from tag_fixture where label in('creator','cook','other');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from tag_fixture where label='creator'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age_v2('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
reset role;
insert into public.recipes(id,title,short_description,difficulty,total_time_minutes,author_id,is_hidden)
select id,'Tag fixture recipe '||label,'Synthetic recipe summary','Easy',10,(select id from tag_fixture where label='creator'),label='hidden' from tag_fixture where label in('recipe','hidden');
insert into storage.objects(bucket_id,name)
select 'community_recipe_images',(select id from tag_fixture where label='cook')||'/'||id||'/a.webp' from tag_fixture where label in('post','failed','muted');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from tag_fixture where label='cook'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age_v2('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
do $$ declare pid uuid:=(select id from tag_fixture where label='post'); rid uuid:=(select id from tag_fixture where label='recipe'); failed uuid:=(select id from tag_fixture where label='failed'); paths jsonb; denied boolean; result jsonb; begin
 if (select count(*) from public.search_post_recipes('Tag fixture',0))<>1 then raise exception 'Hidden recipe search leak'; end if;
 perform public.ensure_post_draft(failed);
 denied:=false;
 begin perform public.publish_recipe_photo_post(failed,'',jsonb_build_array('community:'||auth.uid()||'/'||failed||'/a.webp'),(select id from tag_fixture where label='hidden')); exception when insufficient_privilege then denied:=true; end;
 if not denied or exists(select 1 from public.photo_posts where id=failed and (recipe_id is not null or status='published')) then raise exception 'Hidden recipe tagged or failure not atomic'; end if;
 perform public.ensure_post_draft(pid);
 paths:=jsonb_build_array('community:'||auth.uid()||'/'||pid||'/a.webp');
 result:=public.publish_recipe_photo_post(pid,'Made this!',paths,rid);
 perform public.publish_recipe_photo_post(pid,'Made this!',paths,rid);
 if result->>'status'<>'published' then raise exception 'Tagged publish failed'; end if;
 if (select count(*) from public.get_post_recipe_tags(array[pid]))<>1 then raise exception 'Original recipe tag missing'; end if;
 denied:=false;
 begin perform public.react_to_recipe_photo_post(pid,true); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Post author impersonated original recipe author'; end if;
 denied:=false;
 begin update public.photo_posts set recipe_id=null where id=pid; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Direct tag rewrite allowed'; end if;
end $$;
reset role;
do $$ begin if (select count(*) from public.user_notifications where post_id=(select id from tag_fixture where label='post'))<>1 then raise exception 'Duplicate or missing creator notice'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from tag_fixture where label='creator'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare pid uuid:=(select id from tag_fixture where label='post'); result jsonb; begin
 if (select count(*) from public.user_notifications where post_id=pid and kind='recipe_photo_post')<>1 then raise exception 'Creator notification invisible'; end if;
 result:=public.react_to_recipe_photo_post(pid,true);
 if result->>'reacted'<>'true' or not (select author_reacted from public.get_post_recipe_tags(array[pid])) then raise exception 'Original author reaction failed'; end if;
 perform public.react_to_recipe_photo_post(pid,false);
 if (select author_reacted from public.get_post_recipe_tags(array[pid])) then raise exception 'Reaction removal failed'; end if;
 insert into public.notification_preferences(user_id,comments) values(auth.uid(),false);
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from tag_fixture where label='cook'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.ensure_post_draft((select id from tag_fixture where label='muted'));
select public.publish_recipe_photo_post((select id from tag_fixture where label='muted'),'Muted fixture',jsonb_build_array('community:'||auth.uid()||'/'||(select id from tag_fixture where label='muted')||'/a.webp'),(select id from tag_fixture where label='recipe'));
reset role;
do $$ begin if exists(select 1 from public.user_notifications where post_id=(select id from tag_fixture where label='muted')) then raise exception 'Muted photo feedback was delivered'; end if; end $$;
insert into public.user_blocks(blocker_id,blocked_id) values((select id from tag_fixture where label='creator'),(select id from tag_fixture where label='cook'));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from tag_fixture where label='cook'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.search_post_recipes('Tag fixture',0)) or exists(select 1 from public.get_post_recipe_tags(array[(select id from tag_fixture where label='post')])) then raise exception 'Blocked original recipe leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from tag_fixture where label='creator'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.user_notifications where post_id=(select id from tag_fixture where label='post')) then raise exception 'Blocked feedback notice leaked'; end if; end $$;
reset role;
delete from public.user_blocks where blocker_id=(select id from tag_fixture where label='creator');
update public.photo_posts set is_hidden=true where id=(select id from tag_fixture where label='post');
set local role authenticated;
do $$ begin if exists(select 1 from public.user_notifications where post_id=(select id from tag_fixture where label='post')) then raise exception 'Hidden feedback notice leaked'; end if; end $$;
reset role;
delete from public.recipes where id=(select id from tag_fixture where label='recipe');
do $$ begin
 if exists(select 1 from public.photo_posts where recipe_id=(select id from tag_fixture where label='recipe')) or exists(select 1 from public.user_notifications where post_id=(select id from tag_fixture where label='post')) then raise exception 'Deleted recipe left tag or notice'; end if;
 if not exists(select 1 from public.photo_posts where id=(select id from tag_fixture where label='post')) then raise exception 'Recipe deletion deleted photo post'; end if;
end $$;
rollback;
select 'Recipe tagging, immutable/idempotent publish, creator-only reactions, notifications, preferences, blocks, hiding and delete cleanup passed; all fixtures rolled back.' as result;
