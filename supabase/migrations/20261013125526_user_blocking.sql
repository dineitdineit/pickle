create schema blocking_helpers;
revoke all on schema blocking_helpers from public,anon,authenticated;
grant usage on schema blocking_helpers to authenticated;
create table public.user_blocks(
 blocker_id uuid not null references public.profiles(id) on delete cascade,
 blocked_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(blocker_id,blocked_id),
 check(blocker_id<>blocked_id)
);
create index user_blocks_reverse on public.user_blocks(blocked_id,blocker_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public,anon,authenticated;
grant select on public.user_blocks to authenticated;
create policy own_block_list on public.user_blocks for select to authenticated using(blocker_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

-- Only participants can test a relationship, never enumerate who blocked others.
create function blocking_helpers.pair_blocked(p_first uuid,p_second uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select auth.uid() in (p_first,p_second) and exists(select 1 from public.user_blocks where (blocker_id=p_first and blocked_id=p_second) or (blocker_id=p_second and blocked_id=p_first));
$$;
revoke all on function blocking_helpers.pair_blocked(uuid,uuid) from public,anon,authenticated;
grant execute on function blocking_helpers.pair_blocked(uuid,uuid) to authenticated;
create function blocking_helpers.get_block_state(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to manage blocks' using errcode='42501'; end if;
 return jsonb_build_object('user_id',p_user_id,'blocked',exists(select 1 from public.user_blocks where blocker_id=auth.uid() and blocked_id=p_user_id),'can_contact',not blocking_helpers.pair_blocked(auth.uid(),p_user_id));
end; $$;
revoke all on function blocking_helpers.get_block_state(uuid) from public,anon,authenticated;
grant execute on function blocking_helpers.get_block_state(uuid) to authenticated;
create function public.get_user_block_state(p_user_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select blocking_helpers.get_block_state(p_user_id); $$;
revoke all on function public.get_user_block_state(uuid) from public,anon,authenticated;
grant execute on function public.get_user_block_state(uuid) to authenticated;

create function blocking_helpers.set_user_block(p_user_id uuid,p_blocked boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to manage blocks' using errcode='42501'; end if;
 if p_user_id is null or p_user_id=uid or p_blocked is null then raise exception 'Choose another user' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('block:'||least(uid,p_user_id)::text||':'||greatest(uid,p_user_id)::text,0));
 if p_blocked then
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'User not available' using errcode='P0002'; end if;
  insert into public.user_blocks(blocker_id,blocked_id) values(uid,p_user_id) on conflict do nothing;
  delete from public.user_follows where (follower_id=uid and followed_id=p_user_id) or (follower_id=p_user_id and followed_id=uid);
  delete from public.user_notifications where kind in ('follow','new_recipe') and ((recipient_id=uid and actor_id=p_user_id) or (recipient_id=p_user_id and actor_id=uid));
 else
  delete from public.user_blocks where blocker_id=uid and blocked_id=p_user_id;
 end if;
 return blocking_helpers.get_block_state(p_user_id);
end; $$;
revoke all on function blocking_helpers.set_user_block(uuid,boolean) from public,anon,authenticated;
grant execute on function blocking_helpers.set_user_block(uuid,boolean) to authenticated;
create function public.set_user_block(p_user_id uuid,p_blocked boolean) returns jsonb language sql security invoker set search_path='' as $$ select blocking_helpers.set_user_block(p_user_id,p_blocked); $$;
revoke all on function public.set_user_block(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_user_block(uuid,boolean) to authenticated;

-- Shared pair lock closes the race between blocking and direct client inserts.
create function blocking_helpers.guard_contact() returns trigger
language plpgsql security definer set search_path='' as $$
declare first_id uuid; second_id uuid;
begin
 if tg_table_name='direct_messages' then first_id:=new.sender_id;second_id:=new.recipient_id;
 else first_id:=new.follower_id;second_id:=new.followed_id; end if;
 perform pg_advisory_xact_lock(hashtextextended('block:'||least(first_id,second_id)::text||':'||greatest(first_id,second_id)::text,0));
 if blocking_helpers.pair_blocked(first_id,second_id) then raise exception 'Contact is unavailable' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function blocking_helpers.guard_contact() from public,anon,authenticated;
create trigger guard_blocked_message before insert on public.direct_messages for each row execute function blocking_helpers.guard_contact();
create trigger guard_blocked_follow before insert on public.user_follows for each row execute function blocking_helpers.guard_contact();
create policy block_message_read on public.direct_messages as restrictive for select to authenticated using(not blocking_helpers.pair_blocked(sender_id,recipient_id));
create policy block_message_write on public.direct_messages as restrictive for insert to authenticated with check(not blocking_helpers.pair_blocked(sender_id,recipient_id));
create policy block_message_receipt on public.direct_messages as restrictive for update to authenticated using(not blocking_helpers.pair_blocked(sender_id,recipient_id)) with check(not blocking_helpers.pair_blocked(sender_id,recipient_id));
create policy block_follow_write on public.user_follows as restrictive for insert to authenticated with check(not blocking_helpers.pair_blocked(follower_id,followed_id));
create policy block_follow_notifications on public.user_follows as restrictive for update to authenticated using(not blocking_helpers.pair_blocked(follower_id,followed_id)) with check(not blocking_helpers.pair_blocked(follower_id,followed_id));
create policy block_social_notifications on public.user_notifications as restrictive for select to authenticated using(kind='moderation' or not blocking_helpers.pair_blocked(recipient_id,actor_id));
