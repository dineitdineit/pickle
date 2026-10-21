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
  where r.author_id=p_user_id and r.is_hidden=false and not blocking_helpers.viewer_blocked(r.author_id)
  group by r.id
  order by count(v.id) desc,r.created_at desc,r.id
  limit 3
) top_recipe;
$$;

create or replace function author_profile_helpers.get_recipe_author(p_user_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select case when blocking_helpers.viewer_blocked(p.id) then jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',null,'post_count',0,'follower_count',0,'following_count',0,'following',false,'notifications_enabled',false) else jsonb_build_object(
'id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio,
'post_count',(select count(*) from public.recipes r where r.author_id=p.id and r.is_hidden=false),
'follower_count',(select count(*) from public.user_follows f where f.followed_id=p.id),
'following_count',(select count(*) from public.user_follows f where f.follower_id=p.id),
'following',exists(select 1 from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),
'notifications_enabled',coalesce((select f.notify_new_recipes from public.user_follows f where f.followed_id=p.id and f.follower_id=auth.uid()),false)
) end from public.profiles p where p.id=p_user_id;
$$;

create or replace function search_suggestion_helpers.search_ranked_users(p_query text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g')); result jsonb;
begin
  if q='' or char_length(q)>80 or p_offset is null or p_offset<0 or p_offset>100000 then return jsonb_build_object('users','[]'::jsonb,'has_more',false); end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc,c.view_count desc,c.username,c.id),'[]'::jsonb) into result from (
    select p.id,p.username,p.display_name,p.avatar_url,count(distinct r.id) recipe_count,count(v.id) view_count
    from public.profiles p left join public.recipes r on r.author_id=p.id and r.is_hidden=false left join public.recipe_views v on v.recipe_id=r.id
    where not blocking_helpers.viewer_blocked(p.id) and (position(q in lower(coalesce(p.username,'')))>0 or position(q in lower(coalesce(p.display_name,'')))>0)
    group by p.id,p.username,p.display_name,p.avatar_url
    order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 21 offset p_offset
  ) c;
  return jsonb_build_object('users',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality e(value,ord) where ord<=20),'has_more',jsonb_array_length(result)>20);
end; $$;

create or replace function search_suggestion_helpers.get_search_suggestions(p_query text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g')); keywords jsonb; cooks jsonb;
begin
  if q='' or char_length(q)>80 then return jsonb_build_object('keywords','[]'::jsonb,'users','[]'::jsonb); end if;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.search_count desc,k.keyword),'[]'::jsonb) into keywords from (
    select e.normalized_query as keyword,count(*) as search_count
    from public.search_events e
    where e.searched_at>=now()-interval '30 days' and e.result_count>0
      and char_length(e.normalized_query) between 1 and 80 and position(q in e.normalized_query)>0
    group by e.normalized_query having count(*)>=2
    order by count(*) desc,e.normalized_query limit 6
  ) k;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc,c.view_count desc,c.username,c.id),'[]'::jsonb) into cooks from (
    select p.id,p.username,p.display_name,p.avatar_url,count(distinct r.id) as recipe_count,count(v.id) as view_count
    from public.profiles p
    left join public.recipes r on r.author_id=p.id and r.is_hidden=false
    left join public.recipe_views v on v.recipe_id=r.id
    where not blocking_helpers.viewer_blocked(p.id) and (position(q in lower(coalesce(p.username,'')))>0 or position(q in lower(coalesce(p.display_name,'')))>0)
    group by p.id,p.username,p.display_name,p.avatar_url
    order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 8
  ) c;
  return jsonb_build_object('keywords',keywords,'users',cooks);
end; $$;

create function blocking_helpers.list_blocked_users(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to manage blocks' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>10000 then raise exception 'Invalid limit' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(b) order by b.created_at desc,b.blocked_id),'[]'::jsonb)
 from (select u.blocked_id,u.created_at,jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url) as profile
 from public.user_blocks u join public.profiles p on p.id=u.blocked_id where u.blocker_id=auth.uid() order by u.created_at desc,u.blocked_id limit p_limit+1) b);
end; $$;
revoke all on function blocking_helpers.list_blocked_users(integer) from public,anon,authenticated;
grant execute on function blocking_helpers.list_blocked_users(integer) to authenticated;
create function public.list_blocked_users(p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path='' as $$ select blocking_helpers.list_blocked_users(p_limit); $$;
revoke all on function public.list_blocked_users(integer) from public,anon,authenticated;
grant execute on function public.list_blocked_users(integer) to authenticated;

