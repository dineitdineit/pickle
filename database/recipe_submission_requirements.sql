-- Publishing requires a cover photo, description, servings and ingredient quantities/units.
-- Incomplete drafts and optional ingredients/step photos remain supported.
create or replace function private.validate_recipe_submission(p jsonb, complete boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; field text; value text;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>200000 then raise exception 'Invalid recipe data.'; end if;
  if char_length(coalesce(p->>'title',''))>150 or char_length(coalesce(p->>'short_description',''))>300 or char_length(coalesce(p->>'description',''))>10000 then raise exception 'Recipe text is too long.'; end if;
  if complete and (nullif(btrim(p->>'title'),'') is null or coalesce(p->>'difficulty','') not in ('Easy','Intermediate','Advanced')) then raise exception 'Recipe name and difficulty are required.'; end if;
  if complete and nullif(btrim(p->>'cover_image'),'') is null then raise exception 'Recipe photo is required.'; end if;
  if complete and nullif(btrim(p->>'description'),'') is null then raise exception 'Recipe description is required.'; end if;
  if complete and nullif(p->>'servings','') is null then raise exception 'Servings are required.'; end if;
  foreach field in array array['total_time_minutes','servings'] loop
    value:=nullif(p->>field,'');
    if value is not null and (value !~ '^[0-9]+$' or value::numeric<1 or value::numeric>100000) then raise exception 'Time and servings must be positive whole numbers.'; end if;
  end loop;
  if complete and nullif(p->>'total_time_minutes','') is null then raise exception 'Total cooking time is required.'; end if;
  if jsonb_typeof(p->'ingredients') is distinct from 'array' or jsonb_array_length(p->'ingredients')>100 or (complete and jsonb_array_length(p->'ingredients')<1) then raise exception 'Add between 1 and 100 ingredients.'; end if;
  for item in select jsonb_array_elements(p->'ingredients') loop
    if jsonb_typeof(item)<>'object' or char_length(coalesce(item->>'name',''))>200 or char_length(coalesce(item->>'group_name',''))>100 or char_length(coalesce(item->>'substitute',''))>300 then raise exception 'Invalid ingredient.'; end if;
    if complete and (nullif(btrim(item->>'name'),'') is null or nullif(btrim(item->>'group_name'),'') is null) then raise exception 'Ingredient names and groups are required.'; end if;
    if complete and nullif(btrim(item->>'amount'),'') is null then raise exception 'Each ingredient needs a quantity.'; end if;
    if complete and nullif(btrim(item->>'unit'),'') is null then raise exception 'Each ingredient needs a unit.'; end if;
    foreach field in array array['amount','metric_amount'] loop
      value:=nullif(item->>field,'');
      if value is not null and (value !~ '^[0-9]+([.][0-9]+)?$' or value::numeric<0 or value::numeric>1000000) then raise exception 'Ingredient quantities must be non-negative numbers.'; end if;
    end loop;
    if char_length(coalesce(item->>'unit',''))>40 or char_length(coalesce(item->>'metric_unit',''))>40 then raise exception 'Ingredient unit is too long.'; end if;
    if item ? 'optional' and jsonb_typeof(item->'optional')<>'boolean' then raise exception 'Invalid optional ingredient flag.'; end if;
  end loop;
  if jsonb_typeof(p->'steps') is distinct from 'array' or jsonb_array_length(p->'steps')>30 or (complete and jsonb_array_length(p->'steps')<1) then raise exception 'Add between 1 and 30 cooking steps.'; end if;
  for item in select jsonb_array_elements(p->'steps') loop
    if jsonb_typeof(item)<>'object' or char_length(coalesce(item->>'title',''))>150 or char_length(coalesce(item->>'instruction',''))>10000 or (complete and nullif(btrim(item->>'instruction'),'') is null) then raise exception 'Each cooking step needs an instruction.'; end if;
    value:=nullif(item->>'step_time_minutes','');
    if value is not null and (value !~ '^[0-9]+$' or value::numeric>100000) then raise exception 'Step time must be a non-negative whole number.'; end if;
    if item ? 'is_final' and jsonb_typeof(item->'is_final')<>'boolean' then raise exception 'Invalid final step flag.'; end if;
  end loop;
  if jsonb_typeof(p->'tag_ids') is distinct from 'array' or jsonb_array_length(p->'tag_ids')>30 then raise exception 'Invalid tags.'; end if;
  for item in select jsonb_array_elements(p->'tag_ids') loop
    if not exists(select 1 from public.tags where id=(item#>>'{}')::uuid) then raise exception 'Unknown recipe tag.'; end if;
  end loop;
  if p->'nutrition' is not null and p->'nutrition'<>'null'::jsonb then
    if jsonb_typeof(p->'nutrition')<>'object' then raise exception 'Invalid nutrition.'; end if;
    foreach field in array array['calories','protein_g','carbs_g','fat_g'] loop
      value:=nullif(p->'nutrition'->>field,'');
      if (complete and value is null) or (value is not null and (value !~ '^[0-9]+$' or value::numeric>100000)) then raise exception 'Fill all four nutrition values using non-negative whole numbers, or leave nutrition off.'; end if;
    end loop;
    if p->'nutrition' ? 'is_estimated' and jsonb_typeof(p->'nutrition'->'is_estimated')<>'boolean' then raise exception 'Invalid nutrition estimate flag.'; end if;
  end if;
end;
$$;
revoke all on function private.validate_recipe_submission(jsonb,boolean) from public,anon,authenticated;

