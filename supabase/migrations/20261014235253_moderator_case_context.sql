create function operations_helpers.case_context(p_case uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.moderation_cases; rid uuid; target jsonb; recipe jsonb;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case;
 if not found then raise exception 'Case unavailable' using errcode='P0002'; end if;
 if c.target_type='recipe' then rid:=c.target_id;
 elsif c.target_type='review' then select recipe_id,to_jsonb(v) into rid,target from public.recipe_reviews v where id=c.target_id;
 elsif c.target_type='comment' then select recipe_id,to_jsonb(v) into rid,target from public.recipe_comments v where id=c.target_id;
 else select jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,'bio',p.bio) into target from public.profiles p where id=c.target_id; end if;
 if rid is not null then
 select jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'short_description',r.short_description,'cover_image',r.cover_image,'ingredients_image',r.ingredients_image,'video_url',r.video_url,'is_hidden',r.is_hidden,'removed',r.moderation_removed,
 'steps',(select coalesce(jsonb_agg(to_jsonb(s) order by s.step_number),'[]') from public.recipe_steps s where s.recipe_id=r.id),
 'ingredients',(select coalesce(jsonb_agg(jsonb_build_object('name',i.name,'amount',ri.amount,'unit',ri.unit,'substitute',ri.substitute) order by ri.display_order),'[]') from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id where ri.recipe_id=r.id)) into recipe from public.recipes r where r.id=rid;
 end if;
 return jsonb_build_object('case_id',c.id,'type',c.target_type,'target',target,'recipe',recipe);
end; $$;
revoke all on function operations_helpers.case_context(uuid) from public,anon,authenticated;
grant execute on function operations_helpers.case_context(uuid) to authenticated;
create function public.get_moderation_case_context(p_case uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select operations_helpers.case_context(p_case); $$;
revoke all on function public.get_moderation_case_context(uuid) from public,anon,authenticated;
grant execute on function public.get_moderation_case_context(uuid) to authenticated;

