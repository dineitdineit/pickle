create function search_suggestion_helpers.search_ranked_users(p_query text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g')); result jsonb;
begin
  if q='' or char_length(q)>80 or p_offset is null or p_offset<0 or p_offset>100000 then return jsonb_build_object('users','[]'::jsonb,'has_more',false); end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc,c.view_count desc,c.username,c.id),'[]'::jsonb) into result from (
    select p.id,p.username,p.display_name,p.avatar_url,count(distinct r.id) recipe_count,count(v.id) view_count
    from public.profiles p left join public.recipes r on r.author_id=p.id and r.is_hidden=false left join public.recipe_views v on v.recipe_id=r.id
    where position(q in lower(coalesce(p.username,'')))>0 or position(q in lower(coalesce(p.display_name,'')))>0
    group by p.id,p.username,p.display_name,p.avatar_url
    order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 21 offset p_offset
  ) c;
  return jsonb_build_object('users',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality e(value,ord) where ord<=20),'has_more',jsonb_array_length(result)>20);
end; $$;
revoke all on function search_suggestion_helpers.search_ranked_users(text,integer) from public,anon,authenticated;
grant execute on function search_suggestion_helpers.search_ranked_users(text,integer) to anon,authenticated;
create function public.search_ranked_users(p_query text,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$ select search_suggestion_helpers.search_ranked_users(p_query,p_offset); $$;
revoke all on function public.search_ranked_users(text,integer) from public,anon,authenticated;
grant execute on function public.search_ranked_users(text,integer) to anon,authenticated;
