create or replace function blocking_helpers.guard_recipe_interaction() returns trigger
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
 if tg_table_name='comment_likes' and not blocking_helpers.comment_accessible(new.comment_id) then raise exception 'Comment is unavailable' using errcode='42501'; end if;
 return new;
end; $$;

