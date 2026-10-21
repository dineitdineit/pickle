create schema post_helpers;
revoke all on schema post_helpers from public,anon,authenticated;
grant usage on schema post_helpers to anon,authenticated;
create table public.photo_posts (
 id uuid primary key, author_id uuid not null references public.profiles(id) on delete cascade,
 caption text not null default '' check(char_length(caption)<=2200),
 status text not null default 'draft' check(status in('draft','published')),
 is_hidden boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz,
 check((status='published')=(published_at is not null))
);
create index photo_posts_author_feed on public.photo_posts(author_id,published_at desc,id) where status='published';
create table public.post_photos (
 id uuid primary key default gen_random_uuid(), post_id uuid not null references public.photo_posts(id) on delete cascade,
 image_path text not null, position integer not null check(position between 0 and 9),
 unique(post_id,position), unique(post_id,image_path)
);
alter table public.photo_posts enable row level security;
alter table public.post_photos enable row level security;
revoke all on public.photo_posts,public.post_photos from anon,authenticated;
grant select on public.photo_posts,public.post_photos to anon,authenticated;
create function post_helpers.visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photo_posts p join public.profiles a on a.id=p.author_id
 where p.id=p_id and (p.author_id=auth.uid() or private.is_admin() or
 (p.status='published' and not p.is_hidden and not a.moderation_hidden and not blocking_helpers.viewer_blocked(p.author_id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=p.author_id))));
$$;
revoke all on function post_helpers.visible(uuid) from public;
grant execute on function post_helpers.visible(uuid) to anon,authenticated;
create policy read_photo_posts on public.photo_posts for select to anon,authenticated using(post_helpers.visible(id));
create policy read_post_photos on public.post_photos for select to anon,authenticated using(post_helpers.visible(post_id));
create trigger guard_post_photo before insert or update on public.post_photos for each row execute function media_helpers.guard_references();
create trigger queue_post_photo after delete or update on public.post_photos for each row execute function media_helpers.queue_old_media();

create function post_helpers.ensure_draft(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photo_posts;
begin
 if not operations_helpers.can_act('publish') or not consent_helpers.has_current_consent() then raise exception 'Account and policy agreement required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||auth.uid()::text,0));
 if not operations_helpers.can_act('publish') then raise exception 'Account unavailable' using errcode='42501'; end if;
 insert into public.photo_posts(id,author_id) values(p_id,auth.uid()) on conflict do nothing;
 select * into p from public.photo_posts where id=p_id and author_id=auth.uid() for update;
 if p.id is null then raise exception 'Post unavailable' using errcode='42501'; end if;
 update public.photo_posts set updated_at=now() where id=p.id;
 return jsonb_build_object('id',p.id,'status',p.status);
end; $$;
revoke all on function post_helpers.ensure_draft(uuid) from public,anon;
grant execute on function post_helpers.ensure_draft(uuid) to authenticated;
create function public.ensure_post_draft(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select post_helpers.ensure_draft(p_id); $$;
revoke all on function public.ensure_post_draft(uuid) from public,anon;
grant execute on function public.ensure_post_draft(uuid) to authenticated;

create function post_helpers.publish(p_id uuid,p_caption text,p_photos jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photo_posts; image text; idx integer:=0; existing jsonb;
begin
 if not operations_helpers.can_act('publish') or not consent_helpers.has_current_consent() then raise exception 'Account and policy agreement required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||auth.uid()::text,0));
 if not operations_helpers.can_act('publish') then raise exception 'Account unavailable' using errcode='42501'; end if;
 if p_caption is null or char_length(p_caption)>2200 or p_photos is null or jsonb_typeof(p_photos)<>'array' then raise exception 'Invalid post' using errcode='22023'; end if;
 if jsonb_array_length(p_photos) not between 1 and 10 then raise exception 'Choose 1 to 10 photos' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_photos) v where jsonb_typeof(v)<>'string') or
 (select count(distinct v) from jsonb_array_elements_text(p_photos) v)<>jsonb_array_length(p_photos) then raise exception 'Invalid photos' using errcode='22023'; end if;
 select * into p from public.photo_posts where id=p_id and author_id=auth.uid() for update;
 if p.id is null then raise exception 'Post unavailable' using errcode='42501'; end if;
 if p.status='published' then
  select jsonb_agg(image_path order by position) into existing from public.post_photos where post_id=p.id;
  if p.caption=btrim(p_caption) and existing=p_photos then return jsonb_build_object('id',p.id,'status','published'); end if;
  raise exception 'This post was already shared. Refresh your posts.' using errcode='40001';
 end if;
 for image in select value from jsonb_array_elements_text(p_photos) loop
  if not starts_with(image,'community:'||auth.uid()::text||'/'||p_id::text||'/') or
   not exists(select 1 from storage.objects o where o.bucket_id='community_recipe_images' and o.name=substr(image,11)) then raise exception 'Photo ownership or upload could not be confirmed' using errcode='42501'; end if;
  insert into public.post_photos(post_id,image_path,position) values(p_id,image,idx); idx:=idx+1;
 end loop;
 update public.photo_posts set caption=btrim(p_caption),status='published',published_at=now(),updated_at=now() where id=p_id;
 return jsonb_build_object('id',p_id,'status','published');
end; $$;
revoke all on function post_helpers.publish(uuid,text,jsonb) from public,anon;
grant execute on function post_helpers.publish(uuid,text,jsonb) to authenticated;
create function public.publish_photo_post(p_id uuid,p_caption text,p_photos jsonb) returns jsonb language sql security invoker set search_path='' as $$ select post_helpers.publish(p_id,p_caption,p_photos); $$;
revoke all on function public.publish_photo_post(uuid,text,jsonb) from public,anon;
grant execute on function public.publish_photo_post(uuid,text,jsonb) to authenticated;

create function post_helpers.remove(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare deleted uuid;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Login required' using errcode='42501'; end if;
 delete from public.photo_posts where id=p_id and author_id=auth.uid() returning id into deleted;
 if deleted is null then raise exception 'Post unavailable' using errcode='42501'; end if;
 perform media_helpers.discard_uploads(p_id);
 return jsonb_build_object('id',deleted,'deleted',true);
end; $$;
revoke all on function post_helpers.remove(uuid) from public,anon;
grant execute on function post_helpers.remove(uuid) to authenticated;
create function public.delete_photo_post(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select post_helpers.remove(p_id); $$;
revoke all on function public.delete_photo_post(uuid) from public,anon;
grant execute on function public.delete_photo_post(uuid) to authenticated;

-- Reuse the existing private media bucket and durable cleanup. Account deletion
-- already removes every file in the account prefix and cascades the post rows.
do $patch$ declare definition text; begin
 select pg_get_functiondef('media_helpers.references_photo(text)'::regprocedure) into definition;
 definition:=replace(definition,'select exists(select 1 from public.recipes',
 'select exists(select 1 from public.post_photos pp where pp.image_path=''community:''||p_path) or exists(select 1 from public.recipes');
 execute definition;
 select pg_get_functiondef('media_helpers.can_read_photo(text)'::regprocedure) into definition;
 definition:=replace(definition,'or private.is_admin()',
 'or private.is_admin() or exists(select 1 from public.post_photos pp where pp.image_path=''community:''||p_path and post_helpers.visible(pp.post_id))');
 execute definition;
 select pg_get_functiondef('retention_helpers.purge_records()'::regprocedure) into definition;
 definition:=replace(definition,'delete from public.search_events',
 'delete from public.photo_posts where status=''draft'' and updated_at<=now()-interval ''7 days''; delete from public.search_events');
 execute definition;
end; $patch$;
notify pgrst,'reload schema';
