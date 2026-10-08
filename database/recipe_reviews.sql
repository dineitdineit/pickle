create table public.recipe_reviews (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  content text not null default '' check (char_length(content) <= 2000 and content = btrim(content)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipe_id, user_id)
);
create index recipe_reviews_recipe_updated_idx on public.recipe_reviews (recipe_id, updated_at desc, id desc);
create index recipe_reviews_user_idx on public.recipe_reviews (user_id);
alter table public.recipe_reviews enable row level security;
revoke all on public.recipe_reviews from anon, authenticated;
grant select on public.recipe_reviews to anon, authenticated;
grant insert (recipe_id, user_id, rating, content), update (rating, content) on public.recipe_reviews to authenticated;
grant delete on public.recipe_reviews to authenticated;
create policy public_read_recipe_reviews on public.recipe_reviews for select to anon, authenticated using (true);
create policy users_insert_own_reviews on public.recipe_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean), false));
create policy users_update_own_reviews on public.recipe_reviews for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy users_delete_own_reviews on public.recipe_reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

create function private.touch_recipe_review() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger recipe_review_updated before update on public.recipe_reviews
  for each row execute function private.touch_recipe_review();

create function public.recipe_rating_summary(p_recipe_id uuid)
returns table (average_rating numeric, rating_count bigint, review_count bigint, star_1 bigint, star_2 bigint, star_3 bigint, star_4 bigint, star_5 bigint)
language sql stable security invoker set search_path = '' as $$
  select coalesce(avg(rating),0), count(*), count(*) filter (where content <> ''),
    count(*) filter (where rating=1), count(*) filter (where rating=2), count(*) filter (where rating=3),
    count(*) filter (where rating=4), count(*) filter (where rating=5)
  from public.recipe_reviews where recipe_id=p_recipe_id;
$$;
revoke all on function public.recipe_rating_summary(uuid) from public;
grant execute on function public.recipe_rating_summary(uuid) to anon, authenticated;
