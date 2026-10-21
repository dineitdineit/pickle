-- Preserve recipe IDs and social activity when an author edits their publication.
create or replace function private.update_recipe_submission(p_id uuid, p_payload jsonb, p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); row public.recipe_submissions; p jsonb:=p_payload; rid uuid; iid uuid; item jsonb; idx int:=0; tag uuid; tag_name text; image text; path text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to edit a recipe.' using errcode='42501'; end if;
  select * into row from public.recipe_submissions where id=p_id for update;
  if not found or row.user_id<>uid or row.status<>'published' or row.published_recipe_id is null then raise exception 'This recipe cannot be edited.' using errcode='42501'; end if;
  if row.updated_at is distinct from p_expected_updated_at then raise exception 'This recipe changed in another window. Reload before saving.' using errcode='40001'; end if;
  rid:=row.published_recipe_id;
  perform 1 from public.recipes where id=rid and author_id=uid for update;
  if not found then raise exception 'This recipe cannot be edited.' using errcode='42501'; end if;
  perform private.validate_recipe_submission(p,true);
  for image in select v from (select p->>'cover_image' v union all select p->>'ingredients_image' union all select p->>'finished_image' union all select s->>'step_image' from jsonb_array_elements(p->'steps') s) imgs where nullif(v,'') is not null loop
    if left(image,char_length('community:'||uid::text||'/'||p_id::text||'/')) <> 'community:'||uid::text||'/'||p_id::text||'/' then raise exception 'Use your own uploaded recipe photos.'; end if;
    path:=substr(image,11);
    if not exists(select 1 from storage.objects where bucket_id='community_recipe_images' and name=path) then raise exception 'A photo is not uploaded yet.'; end if;
  end loop;
  update public.recipes set title=btrim(p->>'title'), short_description=nullif(btrim(p->>'short_description'),''), description=nullif(btrim(p->>'description'),''), difficulty=p->>'difficulty', total_time_minutes=(p->>'total_time_minutes')::int, servings=(p->>'servings')::int, cover_image=p->>'cover_image', ingredients_image=nullif(p->>'ingredients_image',''), finished_image=nullif(p->>'finished_image',''), video_url=nullif(btrim(p->>'video_url'),'') where id=rid and author_id=uid;
  delete from public.recipe_ingredients where recipe_id=rid;
  delete from public.recipe_steps where recipe_id=rid;
  delete from public.recipe_tags where recipe_id=rid;
  delete from public.recipe_nutrition where recipe_id=rid;
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
  for tag_name in select distinct btrim(t#>>'{}') from jsonb_array_elements(coalesce(p->'tag_names','[]'::jsonb)) t loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recipe-tag:'||lower(tag_name),0));
    select id into tag from public.tags where lower(name)=lower(tag_name) order by id limit 1;
    if tag is null then insert into public.tags(name,category) values(tag_name,'community') returning id into tag; end if;
    if not exists(select 1 from public.recipe_tags where recipe_id=rid and tag_id=tag) then insert into public.recipe_tags(recipe_id,tag_id) values(rid,tag); end if;
  end loop;
  if p->'nutrition' is not null and p->'nutrition'<>'null'::jsonb then
    item:=p->'nutrition';
    insert into public.recipe_nutrition(recipe_id,calories,protein_g,carbs_g,fat_g,is_estimated)
    values(rid,(item->>'calories')::int,(item->>'protein_g')::int,(item->>'carbs_g')::int,(item->>'fat_g')::int,coalesce((item->>'is_estimated')::boolean,true));
  end if;

  update public.recipe_submissions set payload=p,updated_at=clock_timestamp() where id=p_id returning * into row;
  return jsonb_build_object('id',row.id,'status',row.status,'recipe_id',rid,'updated_at',row.updated_at);
end;
$$;
revoke all on function private.update_recipe_submission(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function private.update_recipe_submission(uuid,jsonb,timestamptz) to authenticated;
create or replace function public.update_recipe_submission(p_id uuid,p_payload jsonb,p_expected_updated_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select private.update_recipe_submission(p_id,p_payload,p_expected_updated_at); $$;
revoke all on function public.update_recipe_submission(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.update_recipe_submission(uuid,jsonb,timestamptz) to authenticated;

create or replace function private.delete_recipe_submission(p_id uuid,p_expected_updated_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); row public.recipe_submissions;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to delete a recipe.' using errcode='42501'; end if;
  select * into row from public.recipe_submissions where id=p_id for update;
  if not found or row.user_id<>uid then raise exception 'This recipe cannot be deleted.' using errcode='42501'; end if;
  if row.updated_at is distinct from p_expected_updated_at then raise exception 'This recipe changed in another window. Reload before deleting.' using errcode='40001'; end if;
  if row.status='published' and row.published_recipe_id is not null then
    perform 1 from public.recipes where id=row.published_recipe_id and author_id=uid for update;
    if not found then raise exception 'This recipe cannot be deleted.' using errcode='42501'; end if;
    delete from public.recipes where id=row.published_recipe_id and author_id=uid;
  end if;
  delete from public.recipe_submissions where id=p_id and user_id=uid;
  return jsonb_build_object('id',p_id,'deleted',true);
end;
$$;
revoke all on function private.delete_recipe_submission(uuid,timestamptz) from public,anon,authenticated;
grant execute on function private.delete_recipe_submission(uuid,timestamptz) to authenticated;
create or replace function public.delete_recipe_submission(p_id uuid,p_expected_updated_at timestamptz) returns jsonb
language sql security invoker set search_path='' as $$ select private.delete_recipe_submission(p_id,p_expected_updated_at); $$;
revoke all on function public.delete_recipe_submission(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.delete_recipe_submission(uuid,timestamptz) to authenticated;
