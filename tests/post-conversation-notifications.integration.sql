-- CASE 1: independent synthetic fixture; rolled back.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(c,p,'Expiry fixture') from f;
reset role;
update public.user_notifications set created_at=now()-interval '31 days' where post_id=(select p from f);
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin if exists(select 1 from public.user_notifications where post_id=(select p from f)) then raise exception 'Expired alert visible'; end if;end $$;
reset role;
update public.user_notifications set created_at=now() where post_id=(select p from f);
update public.photo_posts set is_hidden=true where id=(select p from f);
set local role authenticated;
do $$begin if exists(select 1 from public.user_notifications where post_id=(select p from f)) or exists(select 1 from public.get_post_comment_context((select p from f),(select c from f))) then raise exception 'Hidden conversation leaked'; end if;end $$;
rollback;
-- Original recipient-selection case follows.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(c,p,'Block fixture') from f;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) select u,v from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
if exists(select 1 from public.user_notifications where post_id=(select p from f)) or exists(select 1 from public.get_post_comment_context((select p from f),(select c from f))) then raise exception 'Blocked conversation leaked'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
begin perform public.add_post_comment(d,p,'Blocked attempt') from f; raise exception 'Blocked write allowed'; exception when insufficient_privilege then null; end;
end $$;
rollback;
-- Original recipient-selection case follows.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(c,p,'Comment') from f;
select public.add_post_comment(c,p,'Comment') from f;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(d,p,'Reply',c) from f;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',w,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(x,p,'Another reply',c) from f;
reset role;
do $$begin
if (select count(*) from public.user_notifications where post_id=(select p from f))<>4 then raise exception 'Missing, self or duplicate notices'; end if;
if not exists(select 1 from public.user_notifications where post_comment_id=(select d from f) and kind='post_reply' and recipient_id=(select v from f)) then raise exception 'Reply route wrong'; end if;
end $$;
rollback;

-- CASE 2: independent synthetic fixture; rolled back.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(c,p,'Own post') from f;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(d,p,'Reply',c) from f;
reset role;
do $$begin
if (select count(*) from public.user_notifications where post_id=(select p from f))<>1 or not exists(select 1 from public.user_notifications where post_comment_id=(select d from f) and kind='post_reply') then raise exception 'Owner/parent duplicate or self notice'; end if;
end $$;
rollback;

-- CASE 3: independent synthetic fixture; rolled back.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
insert into public.notification_preferences(user_id,comments,replies) select u,false,false from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(c,p,'Muted') from f;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(d,p,'Own') from f;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(x,p,'Muted reply',d) from f;
reset role;
do $$begin if exists(select 1 from public.user_notifications where post_id=(select p from f)) then raise exception 'Muted alert delivered'; end if;end $$;
rollback;

-- CASE 4: independent synthetic fixture; rolled back.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',v,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
select public.add_post_comment(c,p,'Read me') from f;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin if (select count(*) from public.user_notifications where post_id=(select p from f))<>1 then raise exception 'Notice invisible'; end if;end $$;
reset role;
update public.post_comments set deleted_at=now(),content='Comment deleted' where id=(select c from f);
set local role authenticated;
do $$begin if exists(select 1 from public.user_notifications where post_id=(select p from f)) then raise exception 'Deleted comment notice visible'; end if;end $$;
rollback;

-- CASE 5: independent synthetic fixture; rolled back.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v,gen_random_uuid() w,gen_random_uuid() p,gen_random_uuid() c,gen_random_uuid() d,gen_random_uuid() x;
grant select on f to authenticated;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','pn_'||replace(i::text,'-','')) from f,lateral(values(u),(v),(w))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f union all select w from f loop
perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
perform public.confirm_account_age_v2('1990-01-01');
perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end $$;
insert into public.photo_posts(id,author_id,status,published_at) select p,u,'published',now() from f;
insert into public.post_comments(id,post_id,user_id,content,created_at) select gen_random_uuid(),p,v,'Newer comment',now() from f,generate_series(1,25);
insert into public.post_comments(id,post_id,user_id,content,created_at) select c,p,v,'Old root',now()-interval '2 days' from f;
insert into public.post_comments(id,post_id,user_id,parent_id,content,created_at) select d,p,w,c,'Old reply',now()-interval '1 day' from f;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$begin
if (select count(*) from public.get_post_comment_context((select p from f),(select d from f)))<>2 then raise exception 'Old thread context lost'; end if;
if exists(select 1 from public.get_post_comment_context(gen_random_uuid(),(select d from f))) then raise exception 'Cross-post context leaked'; end if;
end $$;
rollback;
