-- Preserve already-owned photos while retaining checks for every replacement.
do $migration$
declare definition text; marker text:='    if left(image,';
begin
  definition:=pg_get_functiondef('private.update_recipe_submission(uuid,jsonb,timestamptz)'::regprocedure);
  if position(marker in definition)=0 then raise exception 'Owner image validation marker was not found'; end if;
  execute replace(definition,marker,$photo_check$    -- Existing images belong to the already-owned publication; replacements must be new owner uploads.
    if exists(select 1 from (
      select row.payload->>'cover_image' v union all
      select row.payload->>'ingredients_image' union all
      select row.payload->>'finished_image' union all
      select s->>'step_image' from jsonb_array_elements(row.payload->'steps') s
    ) existing_images where v=image) then continue; end if;
$photo_check$||marker);
end;
$migration$;

-- Include older authored recipes in My recipes without changing the publications.
insert into public.recipe_submissions(id,user_id,status,published_recipe_id,payload,created_at,updated_at,submitted_at)
select gen_random_uuid(),r.author_id,'published',r.id,
jsonb_build_object(
  'title',coalesce(r.title,''),'short_description',coalesce(r.short_description,''),
  'description',coalesce(r.description,''),'difficulty',coalesce(r.difficulty,''),
  'total_time_minutes',r.total_time_minutes,'servings',r.servings,
  'cover_image',coalesce(r.cover_image,''),'ingredients_image',coalesce(r.ingredients_image,''),
  'finished_image',coalesce(r.finished_image,''),'video_url',coalesce(r.video_url,''),
  'ingredients',coalesce((select jsonb_agg(jsonb_build_object(
    'name',i.name,'group_name',coalesce(nullif(ri.group_name,''),'Ingredients'),
    'amount',ri.amount,'unit',coalesce(ri.unit,''),'metric_amount',ri.metric_amount,
    'metric_unit',coalesce(ri.metric_unit,''),'optional',coalesce(ri.optional,false),
    'substitute',coalesce(ri.substitute,'')
  ) order by ri.display_order,ri.id) from public.recipe_ingredients ri join public.ingredients i on i.id=ri.ingredient_id where ri.recipe_id=r.id),'[]'::jsonb),
  'steps',coalesce((select jsonb_agg(jsonb_build_object(
    'title',coalesce(s.title,''),'instruction',coalesce(s.instruction,''),
    'step_image',coalesce(s.step_image,''),'step_time_minutes',s.step_time_minutes,
    'is_final',coalesce(s.is_final,false)
  ) order by s.step_number,s.id) from public.recipe_steps s where s.recipe_id=r.id),'[]'::jsonb),
  'tag_ids',coalesce((select jsonb_agg(rt.tag_id order by rt.tag_id) from public.recipe_tags rt where rt.recipe_id=r.id),'[]'::jsonb),
  'tag_names','[]'::jsonb,
  'nutrition',(select jsonb_build_object('calories',n.calories,'protein_g',n.protein_g,'carbs_g',n.carbs_g,'fat_g',n.fat_g,'is_estimated',n.is_estimated) from public.recipe_nutrition n where n.recipe_id=r.id)
),r.created_at,r.updated_at,r.created_at
from public.recipes r
where r.author_id is not null and not exists(select 1 from public.recipe_submissions s where s.published_recipe_id=r.id);
