alter table public.user_follows add column notify_new_recipes boolean not null default false;
grant update(notify_new_recipes) on public.user_follows to authenticated;
create policy configure_own_follow_notifications on public.user_follows for update to authenticated
using ((select auth.uid())=follower_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false))
with check ((select auth.uid())=follower_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

create function public.set_author_recipe_notifications(p_user_id uuid,p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); enabled boolean;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to manage notifications.' using errcode='42501'; end if;
  if p_enabled is null then raise exception 'Choose a notification setting.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||':'||p_user_id::text,0));
  update public.user_follows set notify_new_recipes=p_enabled where follower_id=uid and followed_id=p_user_id returning notify_new_recipes into enabled;
  if not found then raise exception 'Follow this cook first.'; end if;
  return jsonb_build_object('user_id',p_user_id,'notifications_enabled',enabled);
end; $$;
revoke all on function public.set_author_recipe_notifications(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_author_recipe_notifications(uuid,boolean) to authenticated;

-- Expose only public profile information and an aggregate count, never the follower graph.
create function private.get_recipe_author(p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
    'follower_count',(select count(*) from public.user_follows f where f.followed_id=p.id),
    'following',exists(select 1 from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),
    'notifications_enabled',coalesce((select f.notify_new_recipes from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),false))
  from public.profiles p where p.id=p_user_id;
$$;
revoke all on function private.get_recipe_author(uuid) from public,anon,authenticated;
grant execute on function private.get_recipe_author(uuid) to anon,authenticated;
create function public.get_recipe_author(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.get_recipe_author(p_user_id); $$;
revoke all on function public.get_recipe_author(uuid) from public,anon,authenticated;
grant execute on function public.get_recipe_author(uuid) to anon,authenticated;

alter table public.user_notifications add column recipe_id uuid references public.recipes(id) on delete cascade;
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications drop constraint user_notifications_recipient_id_actor_id_kind_key;
alter table public.user_notifications add constraint user_notifications_kind_check check(kind in ('follow','new_recipe'));
alter table public.user_notifications add constraint user_notifications_recipe_check check((kind='follow' and recipe_id is null) or (kind='new_recipe' and recipe_id is not null));
create unique index user_notifications_follow_unique on public.user_notifications(recipient_id,actor_id,kind) where kind='follow';
create unique index user_notifications_recipe_unique on public.user_notifications(recipient_id,recipe_id) where kind='new_recipe';
create index user_notifications_recipe_idx on public.user_notifications(recipe_id);
-- Preserve deduplication when a follower turns notifications off and on or refollows.
create or replace function private.notify_new_follower() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.uid()<>new.follower_id or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to follow a user.' using errcode='42501'; end if;
  insert into public.user_notifications(recipient_id,actor_id) values(new.followed_id,new.follower_id) on conflict do nothing;
  return new;
end; $$;

create function private.notify_author_new_recipe() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'published' or new.published_recipe_id is null then return new; end if;
  if tg_op='UPDATE' and old.status='published' then return new; end if;
  if auth.uid() is null or auth.uid()<>new.user_id or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return new; end if;
  if not exists(select 1 from public.recipes r where r.id=new.published_recipe_id and r.author_id=new.user_id and r.is_hidden=false) then return new; end if;
  insert into public.user_notifications(recipient_id,actor_id,kind,recipe_id)
  select f.follower_id,new.user_id,'new_recipe',new.published_recipe_id
  from public.user_follows f where f.followed_id=new.user_id and f.notify_new_recipes
  on conflict do nothing;
  return new;
end; $$;
revoke all on function private.notify_author_new_recipe() from public,anon,authenticated;
create trigger notify_author_new_recipe after insert or update of status,published_recipe_id on public.recipe_submissions
for each row execute function private.notify_author_new_recipe();
