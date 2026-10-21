create schema search_suggestion_helpers;
revoke all on schema search_suggestion_helpers from public,anon,authenticated;
grant usage on schema search_suggestion_helpers to anon,authenticated;
-- Return bounded public aggregates; never expose searchers, raw events or view history.
create function search_suggestion_helpers.get_search_suggestions(p_query text) returns jsonb
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
    where position(q in lower(coalesce(p.username,'')))>0 or position(q in lower(coalesce(p.display_name,'')))>0
    group by p.id,p.username,p.display_name,p.avatar_url
    order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 8
  ) c;
  return jsonb_build_object('keywords',keywords,'users',cooks);
end; $$;
revoke all on function search_suggestion_helpers.get_search_suggestions(text) from public,anon,authenticated;
grant execute on function search_suggestion_helpers.get_search_suggestions(text) to anon,authenticated;
create function public.get_search_suggestions(p_query text) returns jsonb
language sql stable security invoker set search_path='' as $$ select search_suggestion_helpers.get_search_suggestions(p_query); $$;
revoke all on function public.get_search_suggestions(text) from public,anon,authenticated;
grant execute on function public.get_search_suggestions(text) to anon,authenticated;
