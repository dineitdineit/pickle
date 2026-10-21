alter table public.photo_posts add column recipe_id uuid references public.recipes(id) on delete set null;
alter table public.photo_posts add column recipe_author_reacted boolean not null default false;
create index photo_posts_recipe_feed on public.photo_posts(recipe_id,published_at desc,id) where recipe_id is not null and status='published';

create function post_helpers.can_tag_recipe(p_recipe uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recipes r join public.profiles a on a.id=r.author_id
 where r.id=p_recipe and not r.is_hidden and not r.moderation_removed and not a.moderation_hidden
 and guardian_helpers.public_allowed(a.id) and not blocking_helpers.viewer_blocked(a.id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=a.id));
$$;
revoke all on function post_helpers.can_tag_recipe(uuid) from public;
grant execute on function post_helpers.can_tag_recipe(uuid) to anon,authenticated;

create function public.search_post_recipes(p_query text,p_offset integer default 0)
returns table(id uuid,title text,cover_image text,author_name text)
language sql stable security invoker set search_path='' as $$
 select r.id,r.title,r.cover_image,coalesce(nullif(a.display_name,''),a.username,'Pickle user')
 from public.recipes r join public.profiles a on a.id=r.author_id
 where auth.uid() is not null and char_length(btrim(p_query)) between 1 and 80
 and post_helpers.can_tag_recipe(r.id) and strpos(lower(r.title),lower(btrim(p_query)))>0
 order by lower(r.title),r.id limit 20 offset greatest(0,least(coalesce(p_offset,0),200));
$$;
revoke all on function public.search_post_recipes(text,integer) from public,anon;
grant execute on function public.search_post_recipes(text,integer) to authenticated;

create function public.get_post_recipe_tags(p_ids uuid[])
returns table(post_id uuid,recipe_id uuid,title text,cover_image text,author_id uuid,author_name text,author_reacted boolean)
language sql stable security invoker set search_path='' as $$
 select p.id,r.id,r.title,r.cover_image,r.author_id,coalesce(nullif(a.display_name,''),a.username,'Pickle user'),p.recipe_author_reacted
 from public.photo_posts p join public.recipes r on r.id=p.recipe_id join public.profiles a on a.id=r.author_id
 where cardinality(p_ids)<=30 and p.id=any(p_ids) and p.status='published' and not p.is_hidden
 and post_helpers.can_tag_recipe(r.id);
$$;
revoke all on function public.get_post_recipe_tags(uuid[]) from public;
grant execute on function public.get_post_recipe_tags(uuid[]) to anon,authenticated;

alter table public.user_notifications add column post_id uuid references public.photo_posts(id) on delete cascade;
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check check(kind in('follow','new_recipe','moderation','recipe_comment','comment_reply','recipe_photo_post'));
alter table public.user_notifications drop constraint user_notifications_recipe_check;
alter table public.user_notifications add constraint user_notifications_recipe_check check(
 (kind in('follow','moderation') and recipe_id is null and comment_id is null and post_id is null) or
 (kind='new_recipe' and recipe_id is not null and comment_id is null and post_id is null) or
 (kind in('recipe_comment','comment_reply') and recipe_id is not null and comment_id is not null and post_id is null) or
 (kind='recipe_photo_post' and recipe_id is not null and post_id is not null and comment_id is null));
create unique index user_notifications_recipe_photo_post on public.user_notifications(post_id,recipient_id) where kind='recipe_photo_post';

create function post_helpers.public_post(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photo_posts p join public.profiles a on a.id=p.author_id where p.id=p_post and p.status='published' and not p.is_hidden
 and not a.moderation_hidden and guardian_helpers.public_allowed(a.id) and not blocking_helpers.viewer_blocked(p.author_id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=p.author_id));
$$;
revoke all on function post_helpers.public_post(uuid) from public;
grant execute on function post_helpers.public_post(uuid) to anon,authenticated;
create policy visible_recipe_photo_alert on public.user_notifications as restrictive for select to authenticated
 using(kind<>'recipe_photo_post' or (created_at>now()-interval '30 days' and post_helpers.public_post(post_id) and post_helpers.can_tag_recipe(recipe_id)));

create function post_helpers.publish_tagged(p_id uuid,p_caption text,p_photos jsonb,p_recipe uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photo_posts; result jsonb; owner_id uuid;
begin
 if not operations_helpers.can_act('publish') or not consent_helpers.has_current_consent() then raise exception 'Account and policy agreement required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||auth.uid()::text,0));
 if not operations_helpers.can_act('publish') then raise exception 'Account unavailable' using errcode='42501'; end if;
 -- Keep publication and tag immutable and idempotent under simultaneous retries.
 select * into p from public.photo_posts where id=p_id and author_id=auth.uid() for update;
 if p.id is null then raise exception 'Post unavailable' using errcode='42501'; end if;
 if p.status='published' then
  if p.recipe_id is distinct from p_recipe then raise exception 'This post was already shared with a different recipe tag' using errcode='40001'; end if;
  return post_helpers.publish(p_id,p_caption,p_photos);
 end if;
 if p_recipe is not null then
  select author_id into owner_id from public.recipes where id=p_recipe for share;
  if owner_id is null or not post_helpers.can_tag_recipe(p_recipe) then raise exception 'Tagged recipe is no longer available. Remove it or choose another recipe.' using errcode='42501'; end if;
 end if;
 update public.photo_posts set recipe_id=p_recipe where id=p_id;
 result:=post_helpers.publish(p_id,p_caption,p_photos);
 if owner_id is not null and owner_id<>auth.uid() and not blocking_helpers.pair_blocked(owner_id,auth.uid()) then
  insert into public.user_notifications(recipient_id,actor_id,kind,recipe_id,post_id)
  values(owner_id,auth.uid(),'recipe_photo_post',p_recipe,p_id) on conflict do nothing;
 end if;
 return result;
end $$;
revoke all on function post_helpers.publish_tagged(uuid,text,jsonb,uuid) from public,anon;
grant execute on function post_helpers.publish_tagged(uuid,text,jsonb,uuid) to authenticated;
create function public.publish_recipe_photo_post(p_id uuid,p_caption text,p_photos jsonb,p_recipe uuid)
returns jsonb language sql security invoker set search_path='' as $$ select post_helpers.publish_tagged(p_id,p_caption,p_photos,p_recipe); $$;
revoke all on function public.publish_recipe_photo_post(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.publish_recipe_photo_post(uuid,text,jsonb,uuid) to authenticated;

create function post_helpers.react(p_post uuid,p_reacted boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.photo_posts; rid uuid;
begin
 if not operations_helpers.can_act('social') then raise exception 'Account unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||auth.uid()::text,0));
 if not operations_helpers.can_act('social') then raise exception 'Account unavailable' using errcode='42501'; end if;
 select * into p from public.photo_posts where id=p_post for update;
 if p.id is null or p_reacted is null or not post_helpers.public_post(p.id) or not post_helpers.can_tag_recipe(p.recipe_id) then raise exception 'Post unavailable' using errcode='42501'; end if;
 select id into rid from public.recipes where id=p.recipe_id and author_id=auth.uid() for share;
 if rid is null then raise exception 'Only the original recipe author can react' using errcode='42501'; end if;
 update public.photo_posts set recipe_author_reacted=p_reacted where id=p_post;
 return jsonb_build_object('post_id',p_post,'reacted',p_reacted);
end $$;
revoke all on function post_helpers.react(uuid,boolean) from public,anon;
grant execute on function post_helpers.react(uuid,boolean) to authenticated;
create function public.react_to_recipe_photo_post(p_post uuid,p_reacted boolean) returns jsonb language sql security invoker set search_path='' as $$ select post_helpers.react(p_post,p_reacted); $$;
revoke all on function public.react_to_recipe_photo_post(uuid,boolean) from public,anon;
grant execute on function public.react_to_recipe_photo_post(uuid,boolean) to authenticated;

-- Photo feedback follows the existing comment-notification preference and expiry.
do $patch$ declare definition text; begin
 select pg_get_functiondef('private.filter_activity_notification()'::regprocedure) into definition;
 if strpos(definition,'''recipe_comment'',''comment_reply''')=0 then raise exception 'Unexpected preference function'; end if;
 definition:=replace(definition,'''recipe_comment'',''comment_reply''','''recipe_comment'',''comment_reply'',''recipe_photo_post''');
 definition:=replace(definition,'when ''recipe_comment'' then preference.comments','when ''recipe_photo_post'' then preference.comments when ''recipe_comment'' then preference.comments');
 execute definition;
 select pg_get_functiondef('retention_helpers.purge_records()'::regprocedure) into definition;
 if strpos(definition,'''moderation'',''recipe_comment'',''comment_reply''')=0 then raise exception 'Unexpected retention function'; end if;
 definition:=replace(definition,'''moderation'',''recipe_comment'',''comment_reply''','''moderation'',''recipe_comment'',''comment_reply'',''recipe_photo_post''');
 execute definition;
end $patch$;
notify pgrst,'reload schema';
