alter table public.saved_recipes add column cook_state text not null default 'want_to_cook'
 check(cook_state in('want_to_cook','cooked'));

-- Keep identity and save time immutable through the client API. RLS does not
-- protect TRUNCATE, so remove inherited privileges that this feature never needs.
revoke all on public.saved_recipes from anon,authenticated;
grant select,delete on public.saved_recipes to authenticated;
grant insert(user_id,recipe_id) on public.saved_recipes to authenticated;
grant update(cook_state) on public.saved_recipes to authenticated;
create policy update_own_saved_cooking_state on public.saved_recipes for update to authenticated
 using(user_id=(select auth.uid()) and operations_helpers.can_act('social') and blocking_helpers.recipe_accessible(recipe_id))
 with check(user_id=(select auth.uid()) and operations_helpers.can_act('social') and blocking_helpers.recipe_accessible(recipe_id));

create index saved_recipes_recent_idx on public.saved_recipes(user_id,created_at desc,recipe_id desc);
create index saved_recipes_state_recent_idx on public.saved_recipes(user_id,cook_state,created_at desc,recipe_id desc);

create function public.search_saved_recipes(
 p_query text default '',p_state text default 'all',p_before timestamptz default null,p_before_id uuid default null,p_limit integer default 24
) returns table(id uuid,title text,short_description text,difficulty text,total_time_minutes integer,
 video_url text,cover_image text,cook_state text,saved_at timestamptz)
language plpgsql stable security invoker set search_path='' as $$
declare needle text:=lower(btrim(coalesce(p_query,'')));
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to view saved recipes' using errcode='42501'; end if;
 if length(needle)>100 or p_state is null or p_state not in('all','want_to_cook','cooked')
 or p_limit is null or p_limit not between 1 and 50 or ((p_before is null)<>(p_before_id is null)) then raise exception 'Invalid saved recipe query' using errcode='22023'; end if;
 return query
 select r.id,r.title,r.short_description,r.difficulty,r.total_time_minutes,r.video_url,r.cover_image,s.cook_state,s.created_at
 from public.saved_recipes s join public.recipes r on r.id=s.recipe_id
 where s.user_id=(select auth.uid()) and (p_state='all' or s.cook_state=p_state)
 and not r.is_hidden and not r.moderation_removed
 and (needle='' or position(needle in lower(r.title||' '||coalesce(r.short_description,'')))>0)
 and (p_before is null or (s.created_at,s.recipe_id)<(p_before,p_before_id))
 order by s.created_at desc,s.recipe_id desc limit p_limit+1;
end$$;
revoke all on function public.search_saved_recipes(text,text,timestamptz,uuid,integer) from public,anon;
grant execute on function public.search_saved_recipes(text,text,timestamptz,uuid,integer) to authenticated;
notify pgrst,'reload schema';
