-- Synthetic data only. Execute in BEGIN/ROLLBACK, without keeping any fixtures.
create temporary table discovery_fixture(label text primary key,id uuid default gen_random_uuid()) on commit drop;
insert into discovery_fixture(label) values('a'),('b'),('viewer'),('first'),('second'),('third'),('hidden'),('draft');
grant select on discovery_fixture to anon,authenticated;
insert into auth.users(id,email,raw_user_meta_data) select id,'fixture-'||id||'@example.invalid',jsonb_build_object('username','fixture_'||replace(id::text,'-','')) from discovery_fixture where label in('a','b','viewer');
insert into public.photo_posts(id,author_id,caption,status,published_at,is_hidden)
select p.id,a.id,'Synthetic kitchen moment','published','2026-10-16T00:00:00.123456+00',p.label='hidden' from discovery_fixture p join discovery_fixture a on a.label=case when p.label='third' then 'b' else 'a' end where p.label in('first','second','third','hidden');
insert into public.photo_posts(id,author_id) select p.id,a.id from discovery_fixture p,discovery_fixture a where p.label='draft' and a.label='a';
insert into storage.objects(bucket_id,name) select 'community_recipe_images',p.author_id::text||'/'||p.id::text||'/synthetic.webp' from public.photo_posts p where p.id in(select id from discovery_fixture where label in('first','second','third','hidden'));
insert into public.post_photos(post_id,image_path,position) select p.id,'community:'||p.author_id::text||'/'||p.id::text||'/synthetic.webp',0 from public.photo_posts p where p.id in(select id from discovery_fixture where label in('first','second','third','hidden'));
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ declare first_page uuid[]; next_page uuid[]; cursor_id uuid; cursor_time timestamptz; begin
 select array_agg(id order by published_at desc,id desc) into first_page from (select id,published_at from public.photo_posts where id in(select id from discovery_fixture) and status='published' and not is_hidden order by published_at desc,id desc limit 2) page;
 if array_length(first_page,1)<>2 then raise exception 'Global preview count wrong'; end if;
 cursor_id:=first_page[2]; select published_at into cursor_time from public.photo_posts where id=cursor_id;
 select array_agg(id) into next_page from (select id from public.photo_posts where id in(select id from discovery_fixture) and status='published' and not is_hidden and (published_at<cursor_time or (published_at=cursor_time and id<cursor_id)) order by published_at desc,id desc limit 2) page;
 if array_length(next_page,1)<>1 or next_page[1]=any(first_page) then raise exception 'Timestamp tie pagination skipped/duplicated a post'; end if;
 if not exists(select 1 from public.post_photos where post_id=first_page[1]) then raise exception 'Preview cannot read photo relationship'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.profiles set moderation_hidden=true where id=(select id from discovery_fixture where label='b');
set local role anon;
do $$ begin if (select count(*) from public.photo_posts where id in(select id from discovery_fixture) and status='published' and not is_hidden)<>2 then raise exception 'Hidden author leaked into discovery'; end if; end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from discovery_fixture where label='viewer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
select public.set_user_block((select id from discovery_fixture where label='a'),true);
do $$ begin if exists(select 1 from public.photo_posts where id in(select id from discovery_fixture) and status='published' and not is_hidden) then raise exception 'Blocked author leaked into discovery'; end if; end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from discovery_fixture where label='a'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.photo_posts where id in(select id from discovery_fixture) and author_id=auth.uid() and status='published' and not is_hidden)<>2 then raise exception 'Owner profile grid leaks hidden/draft rows'; end if;
 if not exists(select 1 from public.photo_posts where id=(select id from discovery_fixture where label='hidden')) then raise exception 'Owner cannot open own hidden post notice'; end if;
end; $$;
reset role;
select 'Discovery: global feed, timestamp ties, private photos, hidden profiles, blocks and owner grid passed' as result;
