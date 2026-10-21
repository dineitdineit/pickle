-- Names may be assigned during profile creation, but cannot be changed afterward.
create function private.prevent_profile_identity_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if nullif(btrim(old.username),'') is not null and new.username is distinct from old.username then
    raise exception 'Your username cannot be changed after it is set.' using errcode='23514';
  end if;
  if nullif(btrim(old.display_name),'') is not null and new.display_name is distinct from old.display_name then
    raise exception 'Your display name cannot be changed after it is set.' using errcode='23514';
  end if;
  return new;
end; $$;
revoke all on function private.prevent_profile_identity_change() from public,anon,authenticated;
create trigger prevent_profile_identity_change before update on public.profiles
for each row execute function private.prevent_profile_identity_change();
