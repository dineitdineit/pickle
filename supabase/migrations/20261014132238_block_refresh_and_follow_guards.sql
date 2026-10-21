create function blocking_helpers.safety_version() returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in required' using errcode='42501'; end if;
 -- Opaque viewer-scoped change token, never a list of users who blocked someone.
 return (select md5(coalesce(string_agg(blocker_id::text||':'||blocked_id::text||':'||created_at::text,',' order by blocker_id,blocked_id),'')) from public.user_blocks where blocker_id=auth.uid() or blocked_id=auth.uid());
end; $$;
revoke all on function blocking_helpers.safety_version() from public,anon,authenticated;
grant execute on function blocking_helpers.safety_version() to authenticated;
create function public.get_safety_version() returns text language sql stable security invoker set search_path='' as $$ select blocking_helpers.safety_version(); $$;
revoke all on function public.get_safety_version() from public,anon,authenticated;
grant execute on function public.get_safety_version() to authenticated;

create or replace function public.set_user_follow(p_user_id uuid,p_following boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to follow a user.' using errcode='42501'; end if;
 if p_user_id is null or p_user_id=uid or p_following is null then raise exception 'Choose another user.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('block:'||least(uid,p_user_id)::text||':'||greatest(uid,p_user_id)::text,0));
 if blocking_helpers.viewer_blocked(p_user_id) then raise exception 'Contact is unavailable' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'This user is no longer available.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_user_id::text,0));
 if p_following then
  insert into public.user_follows(follower_id,followed_id) values(uid,p_user_id) on conflict do nothing;
 else delete from public.user_follows where follower_id=uid and followed_id=p_user_id;
 end if;
 return jsonb_build_object('user_id',p_user_id,'following',exists(select 1 from public.user_follows where follower_id=uid and followed_id=p_user_id));
end; $$;

create or replace function blocking_helpers.guard_recipe_interaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe uuid; owner_id uuid; target_id uuid; viewer uuid:=auth.uid();
begin
 if viewer is null then return new; end if;
 -- Administrative moderation remains available through its guarded helper.
 if tg_op='UPDATE' then
  if private.is_admin() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
   if new.moderation_status is distinct from old.moderation_status then return new; end if;
  end if;
 end if;
 if tg_table_name='comment_likes' then
  select c.recipe_id,c.user_id into recipe,target_id from public.recipe_comments c where c.id=new.comment_id;
 else
  recipe:=new.recipe_id;
  if tg_table_name='recipe_comments' then
   if new.parent_comment_id is not null then
   select c.user_id into target_id from public.recipe_comments c where c.id=new.parent_comment_id and c.recipe_id=recipe;
   end if;
  end if;
 end if;
 select author_id into owner_id from public.recipes where id=recipe;
 -- Acquire all relevant pair locks in deterministic order to avoid deadlocks.
 for target_id in select distinct id from unnest(array[owner_id,target_id]) id where id is not null order by id loop
  perform pg_advisory_xact_lock(hashtextextended('block:'||least(viewer,target_id)::text||':'||greatest(viewer,target_id)::text,0));
  if blocking_helpers.viewer_blocked(target_id) then raise exception 'Interaction is unavailable' using errcode='42501'; end if;
 end loop;
 if not blocking_helpers.recipe_accessible(recipe) then raise exception 'Recipe is unavailable' using errcode='42501'; end if;
 if tg_table_name='comment_likes' then
  if not blocking_helpers.comment_accessible(new.comment_id) then raise exception 'Comment is unavailable' using errcode='42501'; end if;
 end if;
 return new;
end; $$;

