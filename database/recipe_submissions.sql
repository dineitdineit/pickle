create table public.recipe_submissions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object' and octet_length(payload::text)<=200000),
  status text not null default 'draft' check (status in ('draft','published')),
  published_recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);
create index recipe_submissions_user_updated_idx on public.recipe_submissions(user_id,updated_at desc);
alter table public.recipe_submissions enable row level security;
revoke all on public.recipe_submissions from anon,authenticated;
grant select on public.recipe_submissions to authenticated;
create policy read_own_submissions on public.recipe_submissions for select to authenticated
using ((select auth.uid())=user_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('community_recipe_images','community_recipe_images',true,5242880,array['image/jpeg','image/png','image/webp']);
create policy community_recipe_image_insert on storage.objects for insert to authenticated
with check (bucket_id='community_recipe_images' and (storage.foldername(name))[1]=(select auth.uid())::text
  and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

create function private.validate_recipe_submission(p jsonb, complete boolean) returns void
language plpgsql security invoker set search_path='' as $$
declare item jsonb; field text; value text;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>200000 then raise exception 'Invalid recipe data.'; end if;
  if char_length(coalesce(p->>'title',''))>150 or char_length(coalesce(p->>'short_description',''))>300 or char_length(coalesce(p->>'description',''))>10000 then raise exception 'Recipe text is too long.'; end if;
  if complete and (nullif(btrim(p->>'title'),'') is null or coalesce(p->>'difficulty','') not in ('Easy','Intermediate','Advanced')) then raise exception 'Recipe name and difficulty are required.'; end if;
  foreach field in array array['total_time_minutes','servings'] loop
    value:=nullif(p->>field,'');
    if value is not null and (value !~ '^[0-9]+$' or value::numeric<1 or value::numeric>100000) then raise exception 'Time and servings must be positive whole numbers.'; end if;
  end loop;
  if complete and nullif(p->>'total_time_minutes','') is null then raise exception 'Total cooking time is required.'; end if;
  if jsonb_typeof(p->'ingredients') is distinct from 'array' or jsonb_array_length(p->'ingredients')>100 or (complete and jsonb_array_length(p->'ingredients')<1) then raise exception 'Add between 1 and 100 ingredients.'; end if;
  for item in select jsonb_array_elements(p->'ingredients') loop
    if jsonb_typeof(item)<>'object' or char_length(coalesce(item->>'name',''))>200 or char_length(coalesce(item->>'group_name',''))>100 or char_length(coalesce(item->>'substitute',''))>300 then raise exception 'Invalid ingredient.'; end if;
    if complete and (nullif(btrim(item->>'name'),'') is null or nullif(btrim(item->>'group_name'),'') is null) then raise exception 'Ingredient names and groups are required.'; end if;
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

create function private.save_recipe_submission(p_id uuid,p_payload jsonb,p_submit boolean,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); row public.recipe_submissions; image text; path text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to upload a recipe.' using errcode='42501'; end if;
  if p_id is null or p_submit is null then raise exception 'Invalid submission.'; end if;
  perform private.validate_recipe_submission(p_payload,p_submit);
  select * into row from public.recipe_submissions where id=p_id for update;
  if found then
    if row.user_id<>uid then raise exception 'This recipe belongs to another user.' using errcode='42501'; end if;
    if row.status='published' and p_submit then return jsonb_build_object('id',row.id,'status','published','recipe_id',row.published_recipe_id,'updated_at',row.updated_at); end if;
    if row.status<>'draft' then raise exception 'Published recipes cannot be edited here.'; end if;
    if p_expected_updated_at is distinct from row.updated_at then raise exception 'This draft changed in another window. Reload before saving.' using errcode='40001'; end if;
  end if;
  for image in select v from (select p_payload->>'cover_image' v union all select p_payload->>'ingredients_image' union all select s->>'step_image' from jsonb_array_elements(p_payload->'steps') s) imgs where nullif(v,'') is not null loop
    if left(image,char_length('community:'||uid::text||'/'||p_id::text||'/')) <> 'community:'||uid::text||'/'||p_id::text||'/' then raise exception 'Use your own uploaded recipe photos.'; end if;
    path:=substr(image,11);
    if not exists(select 1 from storage.objects where bucket_id='community_recipe_images' and name=path) then raise exception 'A photo is not uploaded yet. Please retry.'; end if;
  end loop;
  insert into public.recipe_submissions(id,user_id,payload,status,submitted_at)
  values(p_id,uid,p_payload,'draft',case when p_submit then now() else null end)
  on conflict(id) do update set payload=excluded.payload,status=excluded.status,updated_at=clock_timestamp(),submitted_at=excluded.submitted_at
  where recipe_submissions.user_id=uid and recipe_submissions.status='draft' and recipe_submissions.updated_at=p_expected_updated_at
  returning * into row;
  if row.id is null then raise exception 'This draft changed in another window. Reload before saving.' using errcode='40001'; end if;
  if p_submit then perform private.publish_recipe_submission(p_id); select * into row from public.recipe_submissions where id=p_id; end if;
  return jsonb_build_object('id',row.id,'status',row.status,'recipe_id',row.published_recipe_id,'updated_at',row.updated_at);
end;
$$;
revoke all on function private.save_recipe_submission(uuid,jsonb,boolean,timestamptz) from public,anon;
grant execute on function private.save_recipe_submission(uuid,jsonb,boolean,timestamptz) to authenticated;
create function public.save_recipe_submission(p_id uuid,p_payload jsonb,p_submit boolean default false,p_expected_updated_at timestamptz default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.save_recipe_submission(p_id,p_payload,p_submit,p_expected_updated_at); $$;
revoke all on function public.save_recipe_submission(uuid,jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.save_recipe_submission(uuid,jsonb,boolean,timestamptz) to authenticated;

create function private.publish_recipe_submission(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare row public.recipe_submissions; p jsonb; rid uuid; iid uuid; item jsonb; idx int:=0; tag uuid;
begin
  if auth.uid() is null then raise exception 'Log in to publish a recipe.' using errcode='42501'; end if;
  select * into row from public.recipe_submissions where id=p_id for update;
  if not found or row.user_id<>auth.uid() or row.status<>'draft' then raise exception 'This draft cannot be published.' using errcode='42501'; end if;
  p:=row.payload;
  perform private.validate_recipe_submission(p,true);
  insert into public.recipes(title,short_description,description,difficulty,total_time_minutes,servings,cover_image,ingredients_image,author_id)
  values(btrim(p->>'title'),nullif(btrim(p->>'short_description'),''),nullif(btrim(p->>'description'),''),p->>'difficulty',(p->>'total_time_minutes')::int,nullif(p->>'servings','')::int,nullif(p->>'cover_image',''),nullif(p->>'ingredients_image',''),row.user_id) returning id into rid;
  for item in select jsonb_array_elements(p->'ingredients') loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(lower(btrim(item->>'name')),0));
    select id into iid from public.ingredients where lower(name)=lower(btrim(item->>'name')) order by created_at,id limit 1;
    if iid is null then insert into public.ingredients(name) values(btrim(item->>'name')) returning id into iid; end if;
    insert into public.recipe_ingredients(recipe_id,ingredient_id,group_name,amount,unit,metric_amount,metric_unit,optional,substitute,display_order)
    values(rid,iid,btrim(item->>'group_name'),nullif(item->>'amount','')::numeric,nullif(btrim(item->>'unit'),''),nullif(item->>'metric_amount','')::numeric,nullif(btrim(item->>'metric_unit'),''),coalesce((item->>'optional')::boolean,false),nullif(btrim(item->>'substitute'),''),idx);
    idx:=idx+1;
  end loop;
  idx:=1;
  for item in select jsonb_array_elements(p->'steps') loop
    insert into public.recipe_steps(recipe_id,step_number,title,instruction,step_image,step_time_minutes,is_final)
    values(rid,idx,nullif(btrim(item->>'title'),''),btrim(item->>'instruction'),nullif(item->>'step_image',''),nullif(item->>'step_time_minutes','')::int,coalesce((item->>'is_final')::boolean,false));
    idx:=idx+1;
  end loop;
  for tag in select distinct (t#>>'{}')::uuid from jsonb_array_elements(p->'tag_ids') t loop insert into public.recipe_tags(recipe_id,tag_id) values(rid,tag); end loop;
  if p->'nutrition' is not null and p->'nutrition'<>'null'::jsonb then
    item:=p->'nutrition';
    insert into public.recipe_nutrition(recipe_id,calories,protein_g,carbs_g,fat_g,is_estimated)
    values(rid,(item->>'calories')::int,(item->>'protein_g')::int,(item->>'carbs_g')::int,(item->>'fat_g')::int,coalesce((item->>'is_estimated')::boolean,true));
  end if;
  update public.recipe_submissions set status='published',published_recipe_id=rid,submitted_at=now(),updated_at=clock_timestamp() where id=p_id;
  return jsonb_build_object('id',p_id,'status','published','recipe_id',rid);
end;
$$;
revoke all on function private.publish_recipe_submission(uuid) from public,anon,authenticated;
