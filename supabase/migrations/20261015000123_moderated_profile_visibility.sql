alter table public.profiles add column moderation_hidden boolean not null default false;
create function operations_helpers.protect_profile_moderation() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.moderation_hidden is distinct from old.moderation_hidden and current_user in('authenticated','anon') then raise exception 'Use moderation operations to change profile visibility' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function operations_helpers.protect_profile_moderation() from public,anon,authenticated;
create trigger protect_profile_moderation before update on public.profiles for each row execute function operations_helpers.protect_profile_moderation();
grant usage on schema operations_helpers to anon;
create function operations_helpers.profile_visible(p_user uuid,p_hidden boolean) returns boolean language sql stable security definer set search_path='' as $$
select not p_hidden or (auth.uid()=p_user and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) or private.is_admin();
$$;
revoke all on function operations_helpers.profile_visible(uuid,boolean) from public,anon,authenticated;
grant execute on function operations_helpers.profile_visible(uuid,boolean) to anon,authenticated;
create policy moderated_profile_visibility on public.profiles as restrictive for select to anon,authenticated using(operations_helpers.profile_visible(id,moderation_hidden));
create or replace function blocking_helpers.get_block_state(p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to manage blocks' using errcode='42501'; end if;
 return jsonb_build_object('user_id',p_user_id,'blocked',exists(select 1 from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_user_id),
 'can_contact',not blocking_helpers.pair_blocked(auth.uid(),p_user_id) and not exists(select 1 from public.profiles where id=p_user_id and moderation_hidden and id<>auth.uid()));
end; $$;

create or replace function operations_helpers.set_target(p_case uuid,p_action text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.moderation_cases;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case;
 if c.target_type='user' then
  update public.profiles set moderation_hidden=(p_action<>'restore') where id=c.target_id;
 elsif c.target_type='recipe' then
  update public.recipes set is_hidden=(p_action<>'restore'),moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='review' then
  update public.recipe_reviews set moderation_status=case when p_action='restore' then 'active' else 'hidden' end,moderation_removed=(p_action='remove') where id=c.target_id;
 elsif c.target_type='comment' then
  update public.recipe_comments set moderation_status=case p_action when 'restore' then 'active' when 'remove' then 'removed' else 'hidden' end where id=c.target_id;
 end if;
end; $$;

create or replace function author_profile_helpers.get_recipe_author(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select case when p.moderation_hidden and p.id is distinct from auth.uid() then jsonb_build_object('id',p.id,'username',null,'display_name','Unavailable account','avatar_url',null,'bio',null,'post_count',0,'follower_count',0,'following_count',0,'following',false,'notifications_enabled',false) when blocking_helpers.viewer_blocked(p.id) then jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',null,'post_count',0,'follower_count',0,'following_count',0,'following',false,'notifications_enabled',false) else jsonb_build_object(
'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio,
'post_count',(select count(*) from public.recipes r where r.author_id=p.id and r.is_hidden=false),
'follower_count',(select count(*) from public.user_follows f where f.followed_id=p.id),
'following_count',(select count(*) from public.user_follows f where f.follower_id=p.id),
'following',exists(select 1 from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),
'notifications_enabled',coalesce((select f.notify_new_recipes from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),false)
) end from public.profiles p where p.id=p_user_id;
$$;



create or replace function operations_helpers.target_active(p_case uuid) returns boolean
language sql stable security definer set search_path='' as $$
select case c.target_type when 'recipe' then exists(select 1 from public.recipes r where r.id=c.target_id and not r.is_hidden)
when 'review' then exists(select 1 from public.recipe_reviews r where r.id=c.target_id and r.moderation_status='active')
when 'comment' then exists(select 1 from public.recipe_comments r where r.id=c.target_id and r.moderation_status='active') when 'user' then exists(select 1 from public.profiles p where p.id=c.target_id and not p.moderation_hidden) else false end
from public.moderation_cases c where c.id=p_case;
$$;

