-- Keep privileged logic in a non-exposed schema; the public endpoint only forwards.
alter function public.reserve_recipe_ai_use() set schema private;
revoke all on function private.reserve_recipe_ai_use() from public,anon;
grant execute on function private.reserve_recipe_ai_use() to authenticated;
create function public.reserve_recipe_ai_use() returns text
language sql security invoker set search_path='' as $$
  select private.reserve_recipe_ai_use();
$$;
revoke all on function public.reserve_recipe_ai_use() from public,anon;
grant execute on function public.reserve_recipe_ai_use() to authenticated;
