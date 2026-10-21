-- Synthetic records only; queues are uncommitted and cannot dispatch. Roll back.
begin;
set local statement_timeout='8s';
create temp table f as select gen_random_uuid() viewer,gen_random_uuid() cook,gen_random_uuid() other,gen_random_uuid() admin;
grant select on f to authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','feed_'||replace(i::text,'-','')) from f,lateral(values(viewer),(cook),(other),(admin))a(i);
do $$declare i uuid;begin for i in select viewer from f union all select cook from f union all select other from f union all select admin from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end$$;
update public.profiles set role='admin' where id=(select admin from f);
select set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','is_anonymous',false)::text,true) from f;
create temp table baseline as select public.admin_retention_metrics() m;
grant select on baseline to authenticated;
create temp table items as select n,gen_random_uuid() id from generate_series(1,32)n;
grant select on items to authenticated,anon;
select set_config('request.jwt.claims',jsonb_build_object('sub',cook,'role','authenticated','is_anonymous',false)::text,true) from f;
insert into public.recipes(id,title,short_description,difficulty,total_time_minutes,author_id,created_at) select id,'Following fixture '||n,'Synthetic summary','Easy',10,cook,now()-interval '1 hour' from f,items where n<=16;
insert into public.photo_posts(id,author_id,caption,status,published_at,recipe_id) select id,cook,'Synthetic post','published',now()-interval '1 hour',(select id from items where n=1) from f,items where n>16 and n<32;
select set_config('request.jwt.claims',jsonb_build_object('sub',other,'role','authenticated','is_anonymous',false)::text,true) from f;
insert into public.photo_posts(id,author_id,caption,status,published_at,recipe_id) select id,other,'Synthetic result','published',now()-interval '1 hour',(select id from items where n=1) from f,items where n=32;
select set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated','is_anonymous',false)::text,true) from f;
insert into public.user_follows(follower_id,followed_id) select viewer,cook from f;
insert into public.saved_recipes(user_id,recipe_id,created_at) select viewer,id,now()-interval '2 days' from f,items where n in(1,2);
insert into public.saved_recipes(user_id,recipe_id) select viewer,id from f,items where n=3;
select set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$declare row record; anchor timestamptz; k text; aid uuid; seen text[]:='{}'; page_count integer;begin
 if (select count(*) from public.following_feed())<>13 then raise exception 'No bounded lookahead'; end if;
 loop
  page_count:=0;
  for row in select * from public.following_feed(anchor,k,aid,12) limit 12 loop
   if row.kind||row.id=any(seen) then raise exception 'Repeated feed item'; end if;
   seen:=array_append(seen,row.kind||row.id);anchor:=row.posted_at;k:=row.kind;aid:=row.id;page_count:=page_count+1;
   if row.author_id<>(select cook from f) then raise exception 'Unfollowed cook leaked';end if;
   if row.payload->>'id'<>row.id::text then raise exception 'Bad payload';end if;
  end loop;
  exit when page_count<12;
 end loop;
 if cardinality(seen)<>31 then raise exception 'Tied feed pagination lost content: %',cardinality(seen);end if;
 begin perform public.following_feed(now(),null,null);raise exception 'Partial cursor accepted';exception when invalid_parameter_value then null;end;
 perform public.record_saved_recipe_return((select id from items where n=1));
 perform public.record_saved_recipe_return((select id from items where n=1));
 perform public.record_saved_recipe_return((select id from items where n=3));
 update public.saved_recipes set cook_state='cooked' where recipe_id=(select id from items where n=1);
 update public.saved_recipes set cook_state='want_to_cook' where recipe_id=(select id from items where n=1);
 update public.saved_recipes set cook_state='cooked' where recipe_id=(select id from items where n=1);
 begin perform public.admin_retention_metrics();raise exception 'Non-admin got metrics';exception when insufficient_privilege then null;end;
 begin perform count(*) from engagement_helpers.saved_activity;raise exception 'Raw activity exposed';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 if (select count(*) from engagement_helpers.saved_activity where user_id=(select viewer from f) and kind='saved_return')<>1 then raise exception 'Return validation/dedupe failed';end if;
 if (select count(*) from engagement_helpers.saved_activity where user_id=(select viewer from f) and kind='cooked')<>1 then raise exception 'Cooked dedupe failed';end if;
end$$;
-- Hide one recipe/post; block and unfollow are evaluated on every fresh page.
update public.recipes set is_hidden=true where id=(select id from items where n=16);
update public.photo_posts set is_hidden=true where id=(select id from items where n=31);
set local role authenticated;
do $$begin if exists(select 1 from public.following_feed(null,null,null,30) where id in(select id from items where n in(16,31,32))) then raise exception 'Hidden/unfollowed leak';end if;end$$;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) select viewer,cook from f;
set local role authenticated;
do $$begin if exists(select 1 from public.following_feed()) then raise exception 'Blocked content leaked';end if;end$$;
reset role;
delete from public.user_blocks where blocker_id=(select viewer from f);
delete from public.user_follows where follower_id=(select viewer from f);
set local role authenticated;
do $$begin if exists(select 1 from public.following_feed()) then raise exception 'Unfollow did not clear feed';end if;end$$;
reset role;
-- Genuine other-cook result, original-author comment and heart.
select set_config('request.jwt.claims',jsonb_build_object('sub',cook,'role','authenticated','is_anonymous',false)::text,true) from f;
insert into public.post_comments(post_id,user_id,content) select id,cook,'Synthetic response' from items,f where n=32;
select set_config('request.jwt.claims',jsonb_build_object('sub',admin,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$declare m jsonb;begin
 m:=public.admin_retention_metrics();
 if (m->>'returned_saved_pairs')::integer<>(select (baseline.m->>'returned_saved_pairs')::integer+1 from baseline) or (m->>'eligible_saved_pairs')::integer<>(select (baseline.m->>'eligible_saved_pairs')::integer+2 from baseline) then raise exception 'Incorrect return cohort %',m;end if;
 if (m->>'returning_savers')::integer<>(select (baseline.m->>'returning_savers')::integer+1 from baseline) or (m->>'cooks_marking_cooked')::integer<>(select (baseline.m->>'cooks_marking_cooked')::integer+1 from baseline) then raise exception 'Incorrect people counts %',m;end if;
 if (m->>'result_posts')::integer<>(select (baseline.m->>'result_posts')::integer+1 from baseline) or (m->>'results_with_author_response')::integer<>(select (baseline.m->>'results_with_author_response')::integer+1 from baseline) then raise exception 'Incorrect result/response counts %',m;end if;
 begin perform public.admin_retention_metrics(365);raise exception 'Unbounded window permitted';exception when invalid_parameter_value then null;end;
end$$;
reset role;
update public.post_comments set deleted_at=now() where post_id=(select id from items where n=32);
set local role authenticated;
do $$declare m jsonb;begin
 m:=public.admin_retention_metrics();
 if (m->>'results_with_author_response')::integer<>(select (baseline.m->>'results_with_author_response')::integer from baseline) then raise exception 'Deleted response counted';end if;
end$$;
reset role;
update public.post_comments set deleted_at=null where post_id=(select id from items where n=32);
insert into public.user_blocks(blocker_id,blocked_id) select cook,other from f;
set local role authenticated;
do $$declare m jsonb;begin
 m:=public.admin_retention_metrics();
 if (m->>'result_posts')::integer<>(select (baseline.m->>'result_posts')::integer from baseline) then raise exception 'Blocked recipe/result pair counted';end if;
end$$;
reset role;
delete from auth.users where id=(select viewer from f);
do $$begin if exists(select 1 from engagement_helpers.saved_activity where user_id=(select viewer from f)) then raise exception 'Account deletion retained raw activity';end if;end$$;
set local role anon;
do $$begin
 begin perform public.following_feed();raise exception 'Guest feed allowed';exception when insufficient_privilege then null;end;
 begin perform public.record_saved_recipe_return((select id from items limit 1));raise exception 'Guest tracking allowed';exception when insufficient_privilege then null;end;
 begin perform public.admin_retention_metrics();raise exception 'Guest metrics allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
