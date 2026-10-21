-- Viewer-scoped lookups avoid RLS recursion and reveal no third-party block graph.
create function blocking_helpers.viewer_blocked(p_user uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(blocking_helpers.pair_blocked(auth.uid(),p_user),false);
$$;
revoke all on function blocking_helpers.viewer_blocked(uuid) from public,anon,authenticated;
grant usage on schema blocking_helpers to anon;
grant execute on function blocking_helpers.viewer_blocked(uuid) to anon,authenticated;

create function blocking_helpers.recipe_accessible(p_recipe uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.recipes r where r.id=p_recipe and not r.is_hidden
 and not blocking_helpers.viewer_blocked(r.author_id));
$$;
revoke all on function blocking_helpers.recipe_accessible(uuid) from public,anon,authenticated;
grant execute on function blocking_helpers.recipe_accessible(uuid) to anon,authenticated;

create policy block_recipe_read on public.recipes as restrictive for select to authenticated
 using(not blocking_helpers.viewer_blocked(author_id));
create policy block_profile_read on public.profiles as restrictive for select to authenticated
 using(not blocking_helpers.viewer_blocked(id));
-- Child content cannot bypass the recipe restriction via a direct table query.
create policy block_ingredients_read on public.recipe_ingredients as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_steps_read on public.recipe_steps as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_nutrition_read on public.recipe_nutrition as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_tags_read on public.recipe_tags as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_views_read on public.recipe_views as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_views_write on public.recipe_views as restrictive for insert to authenticated with check(blocking_helpers.recipe_accessible(recipe_id));
create policy block_saved_read on public.saved_recipes as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_likes_read on public.recipe_likes as restrictive for select to authenticated using(blocking_helpers.recipe_accessible(recipe_id));
create policy block_comments_read on public.recipe_comments as restrictive for select to authenticated
 using(not blocking_helpers.viewer_blocked(user_id) and blocking_helpers.recipe_accessible(recipe_id));
create policy block_reviews_read on public.recipe_reviews as restrictive for select to authenticated
 using(not blocking_helpers.viewer_blocked(user_id) and blocking_helpers.recipe_accessible(recipe_id));

create function blocking_helpers.comment_accessible(p_comment uuid) returns boolean
language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.recipe_comments c where c.id=p_comment and c.moderation_status='active'
 and not blocking_helpers.viewer_blocked(c.user_id) and blocking_helpers.recipe_accessible(c.recipe_id));
$$;
revoke all on function blocking_helpers.comment_accessible(uuid) from public,anon,authenticated;
grant execute on function blocking_helpers.comment_accessible(uuid) to authenticated;
create policy block_comment_likes_read on public.comment_likes as restrictive for select to authenticated using(blocking_helpers.comment_accessible(comment_id));

-- Serialize every new interaction with a block, including replies to blocked authors.
create function blocking_helpers.guard_recipe_interaction() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipe uuid; owner_id uuid; target_id uuid; viewer uuid:=auth.uid();
begin
 if viewer is null then return new; end if;
 -- Administrative moderation remains available through its guarded helper.
 if tg_op='UPDATE' and tg_table_name in ('recipe_comments','recipe_reviews') and new.user_id<>viewer and private.is_admin() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return new; end if;
 if tg_table_name='comment_likes' then
  select c.recipe_id,c.user_id into recipe,target_id from public.recipe_comments c where c.id=new.comment_id;
 else
  recipe:=new.recipe_id;
  if tg_table_name='recipe_comments' and new.parent_comment_id is not null then
   select c.user_id into target_id from public.recipe_comments c where c.id=new.parent_comment_id and c.recipe_id=recipe;
  end if;
 end if;
 select author_id into owner_id from public.recipes where id=recipe;
 -- Acquire all relevant pair locks in deterministic order to avoid deadlocks.
 for target_id in select distinct id from unnest(array[owner_id,target_id]) id where id is not null order by id loop
  perform pg_advisory_xact_lock(hashtextextended('block:'||least(viewer,target_id)::text||':'||greatest(viewer,target_id)::text,0));
  if blocking_helpers.viewer_blocked(target_id) then raise exception 'Interaction is unavailable' using errcode='42501'; end if;
 end loop;
 if not blocking_helpers.recipe_accessible(recipe) then raise exception 'Recipe is unavailable' using errcode='42501'; end if;
 if tg_table_name='comment_likes' and not blocking_helpers.comment_accessible(new.comment_id) then raise exception 'Comment is unavailable' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function blocking_helpers.guard_recipe_interaction() from public,anon,authenticated;
create trigger guard_blocked_comment before insert or update on public.recipe_comments for each row execute function blocking_helpers.guard_recipe_interaction();
create trigger guard_blocked_review before insert or update on public.recipe_reviews for each row execute function blocking_helpers.guard_recipe_interaction();
create trigger guard_blocked_recipe_like before insert on public.recipe_likes for each row execute function blocking_helpers.guard_recipe_interaction();
create trigger guard_blocked_save before insert on public.saved_recipes for each row execute function blocking_helpers.guard_recipe_interaction();
create trigger guard_blocked_comment_like before insert on public.comment_likes for each row execute function blocking_helpers.guard_recipe_interaction();

