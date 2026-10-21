-- Run inside BEGIN / ROLLBACK so fixtures never remain.
select set_config('test.popular_author',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.popular_prefix','popular-test-'||gen_random_uuid(),true);
insert into public.recipes(title,difficulty,total_time_minutes,author_id,short_description,like_count,is_hidden)
select current_setting('test.popular_prefix')||n,'Easy',10,current_setting('test.popular_author')::uuid,'A short introduction',n,n=5 from generate_series(1,5) n;
insert into public.recipe_views(recipe_id)
select r.id from public.recipes r cross join lateral generate_series(1,right(r.title,1)::integer) n
where r.title like current_setting('test.popular_prefix')||'%';
select set_config('test.popular_expected',(
  select coalesce(jsonb_agg(to_jsonb(t) order by view_count desc,created_at desc,id),'[]'::jsonb)::text from (
    select r.id,r.title,r.cover_image,r.short_description,coalesce(r.like_count,0) like_count,count(v.id) view_count,r.created_at,
    (select coalesce(array_agg(t.name order by t.name,t.id),array[]::text[]) from public.recipe_tags rt join public.tags t on t.id=rt.tag_id where rt.recipe_id=r.id and nullif(btrim(t.name),'') is not null) as "tagNames"
    from public.recipes r left join public.recipe_views v on v.recipe_id=r.id
    where r.author_id=current_setting('test.popular_author')::uuid and r.is_hidden=false
    group by r.id order by count(v.id) desc,r.created_at desc,r.id limit 3
  ) t
),true);
set local role anon;
do $$ declare actual jsonb; begin
  actual:=public.get_profile_popular_recipes(current_setting('test.popular_author')::uuid);
  if actual is distinct from current_setting('test.popular_expected')::jsonb then raise exception 'Wrong counts, order, fields, visibility or top-three limit'; end if;
  if jsonb_array_length(actual)<>3 then raise exception 'Top-three limit failed'; end if;
  if public.get_profile_popular_recipes(null)<>'[]'::jsonb then raise exception 'Missing author must return an empty array'; end if;
end; $$;
reset role;
select 'Public ranking, counts, hidden filtering, top-three limit and missing author passed' as result;

