-- Keep global ratings independent of a viewer's hidden reviews. Only bounded
-- aggregates for an accessible published recipe can leave the privileged helper.
create function blocking_helpers.rating_summary(p_recipe_id uuid)
returns table(average_rating numeric,rating_count bigint,review_count bigint,star_1 bigint,star_2 bigint,star_3 bigint,star_4 bigint,star_5 bigint)
language sql stable security definer set search_path='' as $$
select coalesce(avg(rating),0),count(*),count(*) filter(where content<>''),count(*) filter(where rating=1),count(*) filter(where rating=2),count(*) filter(where rating=3),count(*) filter(where rating=4),count(*) filter(where rating=5)
from public.recipe_reviews where recipe_id=p_recipe_id and moderation_status='active' and blocking_helpers.recipe_accessible(p_recipe_id);
$$;
revoke all on function blocking_helpers.rating_summary(uuid) from public,anon,authenticated;
grant execute on function blocking_helpers.rating_summary(uuid) to anon,authenticated;
create or replace function public.recipe_rating_summary(p_recipe_id uuid)
returns table(average_rating numeric,rating_count bigint,review_count bigint,star_1 bigint,star_2 bigint,star_3 bigint,star_4 bigint,star_5 bigint)
language sql stable security invoker set search_path='' as $$ select * from blocking_helpers.rating_summary(p_recipe_id); $$;

-- Retain old social notices, hide them with RLS, and restore after both unblock.
create or replace function blocking_helpers.set_user_block(p_user_id uuid,p_blocked boolean) returns jsonb
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
 else
  delete from public.user_blocks where blocker_id=uid and blocked_id=p_user_id;
 end if;
 return blocking_helpers.get_block_state(p_user_id);
end; $$;

create function blocking_helpers.guard_social_notice() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='moderation' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended('block:'||least(new.recipient_id,new.actor_id)::text||':'||greatest(new.recipient_id,new.actor_id)::text,0));
 -- Trigger producers can run for either participant; check the pair directly.
 if exists(select 1 from public.user_blocks where (blocker_id=new.recipient_id and blocked_id=new.actor_id) or (blocker_id=new.actor_id and blocked_id=new.recipient_id)) then return null; end if;
 return new;
end; $$;
revoke all on function blocking_helpers.guard_social_notice() from public,anon,authenticated;
create trigger guard_blocked_notice before insert on public.user_notifications for each row execute function blocking_helpers.guard_social_notice();
