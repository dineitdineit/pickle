-- Execute inside BEGIN / ROLLBACK; test search events are never retained.
select set_config('test.search_prefix','suggestion-test-'||gen_random_uuid()::text,true);
insert into public.search_events(query,normalized_query,result_count,searched_at)
select current_setting('test.search_prefix')||'popular',current_setting('test.search_prefix')||'popular',1,now() from generate_series(1,3);
insert into public.search_events(query,normalized_query,result_count,searched_at)
select current_setting('test.search_prefix')||'less',current_setting('test.search_prefix')||'less',1,now() from generate_series(1,2);
insert into public.search_events(query,normalized_query,result_count,searched_at)
select current_setting('test.search_prefix')||'empty',current_setting('test.search_prefix')||'empty',0,now() from generate_series(1,4);
insert into public.search_events(query,normalized_query,result_count,searched_at)
values(current_setting('test.search_prefix')||'once',current_setting('test.search_prefix')||'once',1,now());
set local role anon;
do $$ declare result jsonb; begin
  result:=public.get_search_suggestions(current_setting('test.search_prefix'));
  if jsonb_array_length(result->'keywords')<>2 or result->'keywords'->0->>'keyword'<>current_setting('test.search_prefix')||'popular' then raise exception 'Popularity ranking or result filtering failed'; end if;
  if jsonb_array_length(public.get_search_suggestions('')->'users')<>0 then raise exception 'Empty search returned users'; end if;
  if jsonb_array_length(public.get_search_suggestions(repeat('a',81))->'keywords')<>0 then raise exception 'Oversized query accepted'; end if;
end; $$;
reset role;
do $$
declare q text; expected jsonb; actual jsonb;
begin
  select left(username,1) into q from public.profiles where nullif(username,'') is not null order by id limit 1;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc,c.view_count desc,c.username,c.id),'[]'::jsonb) into expected from (
    select p.id,p.username,p.display_name,p.avatar_url,count(distinct r.id) recipe_count,count(v.id) view_count
    from public.profiles p left join public.recipes r on r.author_id=p.id and r.is_hidden=false left join public.recipe_views v on v.recipe_id=r.id
    where position(lower(q) in lower(coalesce(p.username,'')))>0 or position(lower(q) in lower(coalesce(p.display_name,'')))>0
    group by p.id,p.username,p.display_name,p.avatar_url order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 8
  ) c;
  actual:=public.get_search_suggestions(q)->'users';
  if actual is distinct from expected then raise exception 'User matching, hidden recipe filtering or public rank is wrong'; end if;
end; $$;
select 'Popular matching keywords, frequency ordering, nonempty-result filtering, bounded public user ranking and input limits passed.' as result;
