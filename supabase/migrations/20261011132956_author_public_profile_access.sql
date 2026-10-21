-- Keep signed-out lookup access isolated from the application's private routines.
create schema author_profile_helpers;
revoke all on schema author_profile_helpers from public,anon,authenticated;
grant usage on schema author_profile_helpers to anon,authenticated;
alter function private.get_recipe_author(uuid) set schema author_profile_helpers;
create or replace function public.get_recipe_author(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select author_profile_helpers.get_recipe_author(p_user_id); $$;

