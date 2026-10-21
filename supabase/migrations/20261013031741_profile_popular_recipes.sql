-- Only public recipe summaries and aggregate counts are exposed.
create function author_profile_helpers.get_profile_popular_recipes(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(top_recipe) order by view_count desc,created_at desc,id),'[]'::jsonb)
from (
  select r.id,r.title,r.cover_image,r.short_description,coalesce(r.like_count,0) as like_count,
    count(v.id) as view_count,r.created_at
  from public.recipes r left join public.recipe_views v on v.recipe_id=r.id
  where r.author_id=p_user_id and r.is_hidden=false
  group by r.id
  order by count(v.id) desc,r.created_at desc,r.id
  limit 3
) top_recipe;
$$;
revoke all on function author_profile_helpers.get_profile_popular_recipes(uuid) from public,anon,authenticated;
grant execute on function author_profile_helpers.get_profile_popular_recipes(uuid) to anon,authenticated;
create function public.get_profile_popular_recipes(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
select author_profile_helpers.get_profile_popular_recipes(p_user_id);
$$;
revoke all on function public.get_profile_popular_recipes(uuid) from public,anon,authenticated;
grant execute on function public.get_profile_popular_recipes(uuid) to anon,authenticated;
