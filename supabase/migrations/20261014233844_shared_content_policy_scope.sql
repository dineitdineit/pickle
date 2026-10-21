create function consent_helpers.guard_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not consent_helpers.has_current_consent() then raise exception 'CONTENT_POLICY_CONSENT_REQUIRED' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function consent_helpers.guard_message() from public,anon,authenticated;
create trigger content_consent_message before insert on public.direct_messages for each row execute function consent_helpers.guard_message();
create policy consent_shared_photo_insert on storage.objects as restrictive for insert to authenticated
with check(bucket_id not in('avatars','chat_images') or (select consent_helpers.has_current_consent()));
create policy consent_shared_photo_update on storage.objects as restrictive for update to authenticated
using(bucket_id not in('avatars','chat_images') or (select consent_helpers.has_current_consent()))
with check(bucket_id not in('avatars','chat_images') or (select consent_helpers.has_current_consent()));

