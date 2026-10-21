-- Each section is independent. Synthetic metadata only; always rolled back.
-- CASE: pagination and recent-first ordering
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() p,gen_random_uuid() r,gen_random_uuid() c,gen_random_uuid() d;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select x,x||'@example.invalid',jsonb_build_object('username','pc_'||replace(x::text,'-','')) from f,lateral (values(u),(v)) a(x);
do $$declare i uuid;begin for i in select u from f union all select v from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.recipes(id,title,short_description,difficulty,total_time_minutes,author_id) select r,'Test','Summary','Easy',10,v from f;
insert into public.photo_posts(id,author_id,status,published_at,recipe_id) select p,u,'published',now(),r from f;
insert into public.post_comments(post_id,user_id,content,created_at) select p,u,'Comment '||i,now()-make_interval(secs=>i) from f,generate_series(1,27)i;
set local role authenticated;
do $$begin
if (select count(*) from public.list_post_comments((select p from f)))<>21 or (select count(*) from public.list_post_comments((select p from f),null,20))<>7 then raise exception 'Pagination failed'; end if;
if (select content from public.list_post_comments((select p from f)) limit 1)<>'Comment 1' then raise exception 'Recent-first failed'; end if;
end $$;
rollback;
-- CASE: cross-post, blank and anonymous guards
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() p,gen_random_uuid() r,gen_random_uuid() c,gen_random_uuid() d;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select x,x||'@example.invalid',jsonb_build_object('username','pc_'||replace(x::text,'-','')) from f,lateral (values(u),(v)) a(x);
do $$declare i uuid;begin for i in select u from f union all select v from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.recipes(id,title,short_description,difficulty,total_time_minutes,author_id) select r,'Test','Summary','Easy',10,v from f;
insert into public.photo_posts(id,author_id,status,published_at,recipe_id) select p,u,'published',now(),r from f;
alter table f add column q uuid default gen_random_uuid();
insert into public.photo_posts(id,author_id,status,published_at) select q,u,'published',now() from f;
insert into public.post_comments(id,post_id,user_id,content) select c,q,u,'Other post root' from f;
set local role authenticated;
do $$begin
begin perform public.add_post_comment((select d from f),(select p from f),'Cross post',(select c from f)); raise exception 'Cross post reply allowed'; exception when insufficient_privilege then null; end;
begin perform public.add_post_comment((select d from f),(select p from f),' '); raise exception 'Blank allowed'; exception when invalid_parameter_value then null; end;
perform set_config('request.jwt.claims',jsonb_build_object('sub',(select v from f),'role','authenticated','is_anonymous',true)::text,true);
begin perform public.add_post_comment((select d from f),(select p from f),'Anonymous'); raise exception 'Anonymous allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;


-- CASE: authorship, replies and idempotency
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() p,gen_random_uuid() r,gen_random_uuid() c,gen_random_uuid() d;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select x,x||'@example.invalid',jsonb_build_object('username','pc_'||replace(x::text,'-','')) from f,lateral (values(u),(v)) a(x);
do $$declare i uuid;begin for i in select u from f union all select v from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.recipes(id,title,short_description,difficulty,total_time_minutes,author_id) select r,'Test','Summary','Easy',10,v from f;
insert into public.photo_posts(id,author_id,status,published_at,recipe_id) select p,u,'published',now(),r from f;
set local role authenticated;
select public.add_post_comment(c,p,'Original cook',null) from f;
select public.add_post_comment(c,p,'Original cook',null) from f;
do $$begin
 if (select count(*) from public.list_post_comments((select p from f)))<>1 or not (select is_recipe_author from public.list_post_comments((select p from f))) then raise exception 'Author badge or retry failed'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
select public.add_post_comment(d,p,'Reply',c) from f;
do $$begin
 if (select is_recipe_author from public.list_post_comments((select p from f),(select c from f))) then raise exception 'False author badge'; end if;
 begin perform public.add_post_comment(gen_random_uuid(),(select p from f),'Nested',(select d from f)); raise exception 'Nested reply allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- CASE: authorization and safe deletion
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() p,gen_random_uuid() r,gen_random_uuid() c,gen_random_uuid() d;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select x,x||'@example.invalid',jsonb_build_object('username','pc_'||replace(x::text,'-','')) from f,lateral (values(u),(v)) a(x);
do $$declare i uuid;begin for i in select u from f union all select v from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
insert into public.post_comments(id,post_id,user_id,content) select c,p,u,'Erase me' from f;
insert into public.post_comments(id,post_id,user_id,parent_id,content) select d,p,v,c,'Keep reply' from f;
set local role authenticated;
do $$begin begin perform public.delete_post_comment((select c from f)); raise exception 'Foreign deletion allowed'; exception when insufficient_privilege then null; end;end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
select public.delete_post_comment(c) from f;
do $$begin
 if not (select is_deleted from public.list_post_comments((select p from f))) or (select content from public.list_post_comments((select p from f),(select c from f)))<>'Keep reply' then raise exception 'Delete removed foreign replies'; end if;
 begin insert into public.post_comments(post_id,user_id,content) select p,u,'Bypass' from f; raise exception 'Direct write allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- CASE: block/hidden content cannot be read or receive comments
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() p,gen_random_uuid() c;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select x,x||'@example.invalid',jsonb_build_object('username','pc_'||replace(x::text,'-','')) from f,lateral (values(u),(v)) a(x);
do $$declare i uuid;begin for i in select u from f union all select v from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
insert into public.post_comments(id,post_id,user_id,content) select c,p,u,'Private to blocked viewer' from f;
insert into public.user_blocks(blocker_id,blocked_id) select u,v from f;
set local role authenticated;
do $$begin
 if exists(select 1 from public.list_post_comments((select p from f))) then raise exception 'Blocked comments leaked'; end if;
 begin perform public.add_post_comment(gen_random_uuid(),(select p from f),'Blocked'); raise exception 'Blocked write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
update public.photo_posts set is_hidden=true where id=(select p from f);
set local role authenticated;
do $$begin if exists(select 1 from public.list_post_comments((select p from f))) then raise exception 'Hidden post comments leaked'; end if;end $$;
rollback;
