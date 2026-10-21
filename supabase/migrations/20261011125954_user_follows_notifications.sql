create table public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,followed_id),
  check(follower_id<>followed_id)
);
create index user_follows_followed_idx on public.user_follows(followed_id,created_at desc);
alter table public.user_follows enable row level security;
revoke all on public.user_follows from public,anon,authenticated;
grant select,insert,delete on public.user_follows to authenticated;
create policy read_own_follow_connections on public.user_follows for select to authenticated
using ((select auth.uid())=follower_id or (select auth.uid())=followed_id);
create policy follow_as_self on public.user_follows for insert to authenticated
with check ((select auth.uid())=follower_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
create policy unfollow_as_self on public.user_follows for delete to authenticated
using ((select auth.uid())=follower_id and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'follow' check(kind='follow'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,actor_id,kind),
  check(recipient_id<>actor_id)
);
create index user_notifications_inbox_idx on public.user_notifications(recipient_id,created_at desc);
create index user_notifications_actor_idx on public.user_notifications(actor_id);
alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public,anon,authenticated;
grant select on public.user_notifications to authenticated;
grant update(read_at) on public.user_notifications to authenticated;
create policy read_own_notifications on public.user_notifications for select to authenticated
using ((select auth.uid())=recipient_id);
create policy mark_own_notifications_read on public.user_notifications for update to authenticated
using ((select auth.uid())=recipient_id) with check ((select auth.uid())=recipient_id);

-- Only the database creates notifications; clients cannot forge another user's actor/recipient.
create function private.notify_new_follower() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or auth.uid()<>new.follower_id or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Log in to follow a user.' using errcode='42501';
  end if;
  insert into public.user_notifications(recipient_id,actor_id)
  values(new.followed_id,new.follower_id) on conflict(recipient_id,actor_id,kind) do nothing;
  return new;
end;
$$;
revoke all on function private.notify_new_follower() from public,anon,authenticated;
create trigger notify_new_follower after insert on public.user_follows
for each row execute function private.notify_new_follower();

create function public.set_user_follow(p_user_id uuid,p_following boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to follow a user.' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=uid or p_following is null then raise exception 'Choose another user.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'This user is no longer available.'; end if;
  -- Serialize repeated follow/unfollow operations for the same pair.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||':'||p_user_id::text,0));
  if p_following then
    insert into public.user_follows(follower_id,followed_id) values(uid,p_user_id) on conflict do nothing;
  else
    delete from public.user_follows where follower_id=uid and followed_id=p_user_id;
  end if;
  return jsonb_build_object('user_id',p_user_id,'following',exists(select 1 from public.user_follows where follower_id=uid and followed_id=p_user_id));
end;
$$;
revoke all on function public.set_user_follow(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_user_follow(uuid,boolean) to authenticated;
