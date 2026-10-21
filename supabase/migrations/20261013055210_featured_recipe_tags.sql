create or replace function author_profile_helpers.get_profile_popular_recipes(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(top_recipe) order by view_count desc,created_at desc,id),'[]'::jsonb)
from (
  select r.id,r.title,r.cover_image,r.short_description,coalesce(r.like_count,0) as like_count,
    count(v.id) as view_count,r.created_at,
    (select coalesce(array_agg(t.name order by t.name,t.id),array[]::text[])
     from public.recipe_tags rt join public.tags t on t.id=rt.tag_id
     where rt.recipe_id=r.id and nullif(btrim(t.name),'') is not null) as "tagNames"
  from public.recipes r left join public.recipe_views v on v.recipe_id=r.id
  where r.author_id=p_user_id and r.is_hidden=false
  group by r.id
  order by count(v.id) desc,r.created_at desc,r.id
  limit 3
) top_recipe;
$$;
