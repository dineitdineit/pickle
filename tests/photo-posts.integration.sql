-- Synthetic users and Storage metadata only. Always wrap in BEGIN/ROLLBACK.
create temporary table post_fixture(label text primary key,id uuid default gen_random_uuid()) on commit drop;
insert into post_fixture(label) values('owner'),('viewer'),('post'),('other_post'),('draft');
grant select on post_fixture to authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data)
select id,'fixture-'||id||'@example.invalid',jsonb_build_object('username','fixture_'||replace(id::text,'-','')) from post_fixture where label in('owner','viewer');
select set_config('test.post_path',(select id::text from post_fixture where label='owner')||'/'||(select id::text from post_fixture where label='post')||'/a.webp',true);
select set_config('test.post_path2',(select id::text from post_fixture where label='owner')||'/'||(select id::text from post_fixture where label='post')||'/b.webp',true);
insert into storage.objects(bucket_id,name) values('community_recipe_images',current_setting('test.post_path')),('community_recipe_images',current_setting('test.post_path2'));
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from post_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare denied boolean:=false; begin
 begin perform public.ensure_post_draft((select id from post_fixture where label='post')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Age/consent bypass'; end if;
end; $$;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
select public.ensure_post_draft((select id from post_fixture where label='post'));
select public.ensure_post_draft((select id from post_fixture where label='draft'));
do $$ declare denied boolean:=false; begin
 begin insert into public.photo_posts(id,author_id) values(gen_random_uuid(),auth.uid()); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Direct write allowed'; end if;
 denied:=false;
 begin perform public.publish_photo_post((select id from post_fixture where label='post'),'', '[]'); exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'Empty publish allowed'; end if;
 denied:=false;
 begin perform public.publish_photo_post((select id from post_fixture where label='post'),'',jsonb_build_array('community:'||current_setting('test.post_path'),'community:'||current_setting('test.post_path'))); exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'Duplicate photos allowed'; end if;
 denied:=false;
 begin perform public.publish_photo_post((select id from post_fixture where label='post'),'',jsonb_build_array('community:'||current_setting('test.post_path'),'community:foreign/missing.webp')); exception when insufficient_privilege then denied:=true; end;
 if not denied or exists(select 1 from public.post_photos) then raise exception 'Failed publish was not atomic'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
 if exists(select 1 from public.photo_posts) or media_helpers.can_read_photo(current_setting('test.post_path')) then raise exception 'Private draft leaked'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from post_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.publish_photo_post((select id from post_fixture where label='post'),'  Synthetic post  ',jsonb_build_array('community:'||current_setting('test.post_path2'),'community:'||current_setting('test.post_path')));
select public.publish_photo_post((select id from post_fixture where label='post'),'Synthetic post',jsonb_build_array('community:'||current_setting('test.post_path2'),'community:'||current_setting('test.post_path')));
do $$ declare denied boolean:=false; begin
 if (select count(*) from public.post_photos)<>2 or (select image_path from public.post_photos where position=0)<>'community:'||current_setting('test.post_path2') then raise exception 'Order/idempotency failed'; end if;
 begin perform public.publish_photo_post((select id from post_fixture where label='post'),'Changed','[]'); exception when invalid_parameter_value then denied:=true; end;
 if not denied then raise exception 'Published post changed'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
 if (select count(*) from public.photo_posts)<>1 or (select count(*) from public.post_photos)<>2 then raise exception 'Published post missing or draft leaked'; end if;
 if not media_helpers.can_read_photo(current_setting('test.post_path')) then raise exception 'Published media inaccessible'; end if;
 if (public.get_recipe_author((select id from post_fixture where label='owner'))->>'post_count')::integer<>1 then raise exception 'Photo post not counted on profile'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from post_fixture where label='viewer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
do $$ declare denied boolean:=false; begin
 begin perform public.delete_photo_post((select id from post_fixture where label='post')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-owner deletion allowed'; end if;
 denied:=false;
 begin perform public.ensure_post_draft((select id from post_fixture where label='post')); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Draft takeover allowed'; end if;
end; $$;
select public.set_user_block((select id from post_fixture where label='owner'),true);
do $$ begin
 if exists(select 1 from public.photo_posts) or exists(select 1 from public.post_photos) or media_helpers.can_read_photo(current_setting('test.post_path')) then raise exception 'Blocked post leaked'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.photo_posts set is_hidden=true where id=(select id from post_fixture where label='post');
set local role anon;
do $$ begin if exists(select 1 from public.photo_posts) or media_helpers.can_read_photo(current_setting('test.post_path')) then raise exception 'Hidden post leaked'; end if; end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from post_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.delete_photo_post((select id from post_fixture where label='post'));
reset role;
do $$ begin
 if exists(select 1 from public.post_photos) then raise exception 'Deleted post photos retained'; end if;
 if not exists(select 1 from media_helpers.disposals where path=current_setting('test.post_path')) then raise exception 'Media deletion not queued'; end if;
 if media_helpers.references_photo(current_setting('test.post_path')) then raise exception 'Deleted photo still referenced'; end if;
end; $$;
select 'Photo posts: consent, ownership, atomic publish, order, idempotency, RLS, blocks, hidden media and deletion queue passed' as result;
