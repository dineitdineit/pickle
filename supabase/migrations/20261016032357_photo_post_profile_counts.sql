-- Keep the profile's Posts total consistent with recipes plus photo posts.
-- Security invoker preserves photo-post RLS, including blocks and hiding.
create or replace function public.get_recipe_author(p_user_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select case when base is null or base='null'::jsonb then base else
 jsonb_set(base,'{post_count}',to_jsonb(coalesce((base->>'post_count')::bigint,0)+
 (select count(*) from public.photo_posts p where p.author_id=p_user_id and p.status='published' and not p.is_hidden))) end
 from (select author_profile_helpers.get_recipe_author(p_user_id) as base) profile;
$$;
notify pgrst,'reload schema';
