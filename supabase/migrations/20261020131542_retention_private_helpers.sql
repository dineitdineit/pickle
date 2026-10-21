-- Keep privileged implementations outside the exposed API schema. Public
-- wrappers preserve caller identity and cannot bypass the private auth gates.
alter function public.record_saved_recipe_return(uuid) set schema engagement_helpers;
alter function public.admin_retention_metrics(integer) set schema engagement_helpers;
grant usage on schema engagement_helpers to authenticated;
create function public.record_saved_recipe_return(p_recipe uuid) returns void
language sql security invoker set search_path='' as $$select engagement_helpers.record_saved_recipe_return(p_recipe);$$;
create function public.admin_retention_metrics(p_days integer default 30) returns jsonb
language sql stable security invoker set search_path='' as $$select engagement_helpers.admin_retention_metrics(p_days);$$;
revoke all on function public.record_saved_recipe_return(uuid),public.admin_retention_metrics(integer) from public,anon;
grant execute on function public.record_saved_recipe_return(uuid),public.admin_retention_metrics(integer) to authenticated;
notify pgrst,'reload schema';
