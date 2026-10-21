create function consent_helpers.has_current_consent() returns boolean
language sql stable security definer set search_path='' as $$
select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
and exists(select 1 from public.user_content_consents c join public.content_policy_versions p on p.version=c.policy_version and p.active where c.user_id=auth.uid());
$$;
revoke all on function consent_helpers.has_current_consent() from public,anon,authenticated;
grant execute on function consent_helpers.has_current_consent() to authenticated;
create policy consent_recipe_photo_upload on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'community_recipe_images' or (select consent_helpers.has_current_consent()));

