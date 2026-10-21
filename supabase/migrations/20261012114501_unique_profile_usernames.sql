-- Enforce case-insensitive username uniqueness without changing existing profiles.
create unique index profiles_username_unique on public.profiles(lower(btrim(username))) where nullif(btrim(username),'') is not null;
