create or replace function author_profile_helpers.get_recipe_author(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio,
'post_count',(select count(*) from public.recipes r where r.author_id=p.id and r.is_hidden=false),
'follower_count',(select count(*) from public.user_follows f where f.followed_id=p.id),
'following_count',(select count(*) from public.user_follows f where f.follower_id=p.id),
'following',exists(select 1 from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),
'notifications_enabled',coalesce((select f.notify_new_recipes from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),false)
) from public.profiles p where p.id=p_user_id;
$$;
