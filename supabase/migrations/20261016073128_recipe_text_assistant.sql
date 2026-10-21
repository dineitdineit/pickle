CREATE OR REPLACE FUNCTION private.validate_recipe_submission(p jsonb, complete boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item jsonb; field text; value text;
begin
  if nullif(btrim(p->>'video_url'),'') is not null and (
    jsonb_typeof(p->'video_url')<>'string' or char_length(p->>'video_url')>2048 or
    not (
      btrim(p->>'video_url') ~* '^https://youtu[.]be/[A-Za-z0-9_-]{11}/?([?#][^[:space:]]*)?$' or
      btrim(p->>'video_url') ~* '^https://(www[.]|m[.])?youtube[.]com/(shorts|embed|live)/[A-Za-z0-9_-]{11}/?([?#][^[:space:]]*)?$' or
      btrim(p->>'video_url') ~* '^https://www[.]youtube-nocookie[.]com/embed/[A-Za-z0-9_-]{11}/?([?#][^[:space:]]*)?$' or
      btrim(p->>'video_url') ~* '^https://(www[.]|m[.])?youtube[.]com/watch[?]([^[:space:]#]*&)?v=[A-Za-z0-9_-]{11}(&[^[:space:]]*|#[^[:space:]]*)?$' or
      btrim(p->>'video_url') ~* '^https://(www[.]|m[.])?instagram[.]com/(reel|reels|p|tv)/[A-Za-z0-9_-]+/?([?#][^[:space:]]*)?$'
    )
  ) then raise exception 'Only YouTube and Instagram video links are allowed.'; end if;
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>200000 then raise exception 'Invalid recipe data.'; end if;
  if char_length(coalesce(p->>'title',''))>150 or char_length(coalesce(p->>'short_description',''))>300 or char_length(coalesce(p->>'description',''))>10000 then raise exception 'Recipe text is too long.'; end if;
  if complete and (nullif(btrim(p->>'title'),'') is null or coalesce(p->>'difficulty','') not in ('Easy','Intermediate','Advanced')) then raise exception 'Recipe name and difficulty are required.'; end if;
  if complete and nullif(btrim(p->>'cover_image'),'') is null then raise exception 'Recipe photo is required.'; end if;
  if complete and (jsonb_typeof(p->'short_description') is distinct from 'string' or nullif(btrim(p->>'short_description'),'') is null) then raise exception 'Short description is required.'; end if;
  if (p ? 'ingredient_text' and (jsonb_typeof(p->'ingredient_text') is distinct from 'string' or char_length(p->>'ingredient_text')>10000)) or (p ? 'step_text' and (jsonb_typeof(p->'step_text') is distinct from 'string' or char_length(p->>'step_text')>20000)) then raise exception 'Recipe source text is too long or invalid.'; end if;
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
  if p ? 'tag_names' then
    if jsonb_typeof(p->'tag_names') is distinct from 'array' or jsonb_array_length(p->'tag_names')>10 then raise exception 'Use up to 10 new tags.'; end if;
    for item in select jsonb_array_elements(p->'tag_names') loop
      if jsonb_typeof(item)<>'string' or nullif(btrim(item#>>'{}'),'') is null or char_length(btrim(item#>>'{}'))>40 then raise exception 'Tags must have 1 to 40 characters.'; end if;
    end loop;
  end if;
  if p->'nutrition' is not null and p->'nutrition'<>'null'::jsonb then
    if jsonb_typeof(p->'nutrition')<>'object' then raise exception 'Invalid nutrition.'; end if;
    foreach field in array array['calories','protein_g','carbs_g','fat_g'] loop
      value:=nullif(p->'nutrition'->>field,'');
      if (complete and value is null) or (value is not null and (value !~ '^[0-9]+$' or value::numeric>100000)) then raise exception 'Fill all four nutrition values using non-negative whole numbers, or leave nutrition off.'; end if;
    end loop;
    if p->'nutrition' ? 'is_estimated' and jsonb_typeof(p->'nutrition'->'is_estimated')<>'boolean' then raise exception 'Invalid nutrition estimate flag.'; end if;
  end if;
end;
$function$;


alter table public.recipes alter column description drop not null;
alter table public.recipes add constraint recipes_short_description_required
  check (short_description is not null and char_length(btrim(short_description)) between 1 and 300) not valid;
alter table public.recipes validate constraint recipes_short_description_required;

create table private.recipe_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null check(requests between 1 and 10),
  last_used_at timestamptz not null default now(),
  primary key(user_id,usage_day)
);
create table private.recipe_ai_budget (
  usage_day date primary key,
  requests integer not null check(requests between 1 and 500)
);
alter table private.recipe_ai_usage enable row level security;
alter table private.recipe_ai_budget enable row level security;
revoke all on private.recipe_ai_usage, private.recipe_ai_budget from public,anon,authenticated;

create or replace function public.reserve_recipe_ai_use() returns text
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); today date:=(now() at time zone 'UTC')::date; used integer; last_use timestamptz;
begin
  if uid is null or not operations_helpers.can_act('publish') then return 'not_allowed'; end if;
  -- One short transaction lock makes both user and application budgets atomic.
  perform pg_advisory_xact_lock(837241902);
  select requests,last_used_at into used,last_use from private.recipe_ai_usage where user_id=uid and usage_day=today;
  if coalesce(used,0)>=10 or last_use>now()-interval '1 minute' then return 'rate_limited'; end if;
  if coalesce((select requests from private.recipe_ai_budget where usage_day=today),0)>=500 then return 'rate_limited'; end if;
  insert into private.recipe_ai_usage(user_id,usage_day,requests) values(uid,today,1)
    on conflict(user_id,usage_day) do update set requests=private.recipe_ai_usage.requests+1,last_used_at=now();
  insert into private.recipe_ai_budget(usage_day,requests) values(today,1)
    on conflict(usage_day) do update set requests=private.recipe_ai_budget.requests+1;
  return 'allowed';
end $$;
revoke all on function public.reserve_recipe_ai_use() from public,anon;
grant execute on function public.reserve_recipe_ai_use() to authenticated;
-- No recipe text, model output, email or profile data is kept in the quota ledger.
select cron.schedule('pickle-recipe-ai-expiry','17 2 * * *',
  $job$delete from private.recipe_ai_usage where usage_day<(now() at time zone 'UTC')::date-1;
       delete from private.recipe_ai_budget where usage_day<(now() at time zone 'UTC')::date-1;$job$);
