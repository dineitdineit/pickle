create function consent_helpers.freeze_policy_text() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.version is distinct from old.version or new.terms is distinct from old.terms or new.content_policy is distinct from old.content_policy or new.created_at is distinct from old.created_at then
  raise exception 'Create a new policy version instead of editing accepted text' using errcode='22023';
 end if;
 return new;
end; $$;
revoke all on function consent_helpers.freeze_policy_text() from public,anon,authenticated;
create trigger immutable_policy_text before update on public.content_policy_versions for each row execute function consent_helpers.freeze_policy_text();

