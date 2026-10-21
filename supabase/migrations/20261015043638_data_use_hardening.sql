-- Private recipe media, durable file disposal, and minimum-disclosure discovery.
create schema if not exists media_helpers;
revoke all on schema media_helpers from public,anon,authenticated;
grant usage on schema media_helpers to anon,authenticated,service_role;
create table media_helpers.disposals (
 path text primary key, due_at timestamptz not null default now(),
 attempts integer not null default 0, lease uuid, lease_until timestamptz,
 last_error text check(last_error in('storage_failed','ack_failed'))
);
alter table media_helpers.disposals enable row level security;
revoke all on media_helpers.disposals from public,anon,authenticated;
create policy no_browser_access on media_helpers.disposals to authenticated using(false);

create function media_helpers.references_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recipes r where 'community:'||p_path in(r.cover_image,r.ingredients_image,r.finished_image))
 or exists(select 1 from public.recipe_steps s where s.step_image='community:'||p_path)
 or exists(select 1 from public.recipe_submissions s where jsonb_path_exists(s.payload,'$.** ? (@ == $image)',jsonb_build_object('image','community:'||p_path)))
 or exists(select 1 from public.content_reports r where jsonb_path_exists(r.snapshot,'$.** ? (@ == $image)',jsonb_build_object('image','community:'||p_path)));
$$;
revoke all on function media_helpers.references_photo(text) from public,anon,authenticated;

create function media_helpers.can_read_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from media_helpers.disposals d where d.path=p_path and d.lease is not null)
 and (
 (auth.uid() is not null and split_part(p_path,'/',1)=auth.uid()::text)
 or private.is_admin()
 or exists(select 1 from public.recipes r where blocking_helpers.recipe_accessible(r.id)
 and ('community:'||p_path in(r.cover_image,r.ingredients_image,r.finished_image)
 or exists(select 1 from public.recipe_steps s where s.recipe_id=r.id and s.step_image='community:'||p_path)))
 );
$$;
revoke all on function media_helpers.can_read_photo(text) from public;
grant execute on function media_helpers.can_read_photo(text) to anon,authenticated;

-- A queued/leased deletion cannot race a draft save or publication into a broken reference.
create function media_helpers.guard_references() returns trigger
language plpgsql security definer set search_path='' as $$
declare value text; ref_path text; document jsonb;
begin
 document:=to_jsonb(new);
 for value in select distinct v#>>'{}' from jsonb_path_query(document,'$.** ? (@.type() == "string")') v
 where left(v#>>'{}',10)='community:' order by 1 loop
  if tg_op='UPDATE' and jsonb_path_exists(to_jsonb(old),'$.** ? (@ == $image)',jsonb_build_object('image',value)) then continue; end if;
  ref_path:=substr(value,11);
  perform pg_advisory_xact_lock(hashtextextended('recipe-media:'||ref_path,0));
  if exists(select 1 from media_helpers.disposals d where d.path=ref_path and d.lease is not null)
   or not exists(select 1 from storage.objects o where o.bucket_id='community_recipe_images' and o.name=ref_path)
  then raise exception 'This photo is no longer available. Upload it again.' using errcode='40001'; end if;
 end loop;
 return new;
end; $$;
revoke all on function media_helpers.guard_references() from public,anon,authenticated;
create trigger guard_recipe_media before insert or update on public.recipes for each row execute function media_helpers.guard_references();
create trigger guard_step_media before insert or update on public.recipe_steps for each row execute function media_helpers.guard_references();
create trigger guard_submission_media before insert or update on public.recipe_submissions for each row execute function media_helpers.guard_references();
create trigger guard_report_media before insert or update on public.content_reports for each row execute function media_helpers.guard_references();

create function media_helpers.queue_old_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare image text;
begin
 for image in select distinct v#>>'{}' from jsonb_path_query(to_jsonb(old),'$.** ? (@.type() == "string")') v
 where left(v#>>'{}',10)='community:' loop
  insert into media_helpers.disposals(path) values(substr(image,11))
  on conflict(path) do update set due_at=least(media_helpers.disposals.due_at,now());
 end loop;
 return null;
end; $$;
revoke all on function media_helpers.queue_old_media() from public,anon,authenticated;
create trigger queue_recipe_media after delete or update on public.recipes for each row execute function media_helpers.queue_old_media();
create trigger queue_step_media after delete or update on public.recipe_steps for each row execute function media_helpers.queue_old_media();
create trigger queue_submission_media after delete or update on public.recipe_submissions for each row execute function media_helpers.queue_old_media();

create function media_helpers.discard_uploads(p_submission uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='42501'; end if;
 insert into media_helpers.disposals(path)
 select o.name from storage.objects o where o.bucket_id='community_recipe_images'
 and split_part(o.name,'/',1)=auth.uid()::text and split_part(o.name,'/',2)=p_submission::text
 and not media_helpers.references_photo(o.name)
 on conflict(path) do update set due_at=least(media_helpers.disposals.due_at,now());
end; $$;
revoke all on function media_helpers.discard_uploads(uuid) from public;
grant execute on function media_helpers.discard_uploads(uuid) to authenticated;
create function public.discard_recipe_uploads(p_submission uuid) returns void language sql security invoker set search_path='' as $$ select media_helpers.discard_uploads(p_submission); $$;
revoke all on function public.discard_recipe_uploads(uuid) from public,anon;
grant execute on function public.discard_recipe_uploads(uuid) to authenticated;

create function media_helpers.asset_worker(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare d media_helpers.disposals;
begin
 if p_action='claim' then
  -- Abandoned unsaved uploads have a seven-day recovery window. No referenced
  -- draft, published image or retained report evidence is collected as an orphan.
  insert into media_helpers.disposals(path)
  select o.name from storage.objects o where o.bucket_id='community_recipe_images'
  and p_payload->>'path' is null
  and o.created_at<now()-interval '7 days' and not media_helpers.references_photo(o.name)
  limit 100 on conflict do nothing;
  for d in select * from media_helpers.disposals where due_at<=now()
  and (p_payload->>'path' is null or path=p_payload->>'path')
  and (lease_until is null or lease_until<now()) order by due_at,path limit 100 for update skip locked loop
   perform pg_advisory_xact_lock(hashtextextended('recipe-media:'||d.path,0));
   if media_helpers.references_photo(d.path) then
    delete from media_helpers.disposals where path=d.path and lease is null;
    continue;
   end if;
   if not exists(select 1 from storage.objects where bucket_id='community_recipe_images' and name=d.path) then
    delete from media_helpers.disposals where path=d.path;
    continue;
   end if;
   update media_helpers.disposals set lease=gen_random_uuid(),lease_until=now()+interval '3 minutes',attempts=attempts+1 where path=d.path returning * into d;
   return jsonb_build_object('path',d.path,'lease',d.lease);
  end loop;
  return 'null'::jsonb;
 elsif p_action='ack' then
  if exists(select 1 from storage.objects where bucket_id='community_recipe_images' and name=p_payload->>'path') then return 'false'::jsonb; end if;
  delete from media_helpers.disposals where path=p_payload->>'path' and lease=(p_payload->>'lease')::uuid;
  return to_jsonb(found);
 elsif p_action='retry' then
  update media_helpers.disposals set lease_until=now(),due_at=now()+least(3600,30*power(2,least(attempts,7))::int)*interval '1 second',last_error='storage_failed'
  where path=p_payload->>'path' and lease=(p_payload->>'lease')::uuid;
  return to_jsonb(found);
 end if;
 raise exception 'Invalid action';
end; $$;
revoke all on function media_helpers.asset_worker(text,jsonb) from public,anon,authenticated;
grant execute on function media_helpers.asset_worker(text,jsonb) to service_role;
create function public.recipe_asset_worker(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select media_helpers.asset_worker(p_action,p_payload); $$;
revoke all on function public.recipe_asset_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.recipe_asset_worker(text,jsonb) to service_role;

-- Restrictive policy protects this bucket even if another broad read policy appears.
create policy recipe_media_read on storage.objects for select to anon,authenticated
 using(bucket_id='community_recipe_images' and media_helpers.can_read_photo(name));
create policy recipe_media_read_guard on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'community_recipe_images' or media_helpers.can_read_photo(name));
-- Bucket activation is a separate migration, after the updated client is built.

-- Relationship metadata is visible to either party; the follower's alert choice is not.
revoke select on public.user_follows from authenticated,anon;
revoke select(notify_new_recipes) on public.user_follows from authenticated,anon;
grant select(follower_id,followed_id,created_at) on public.user_follows to authenticated;
revoke update(notify_new_recipes) on public.user_follows from authenticated;
revoke update on public.user_follows from authenticated;
do $move$ declare definition text; begin
 select pg_get_functiondef('public.set_author_recipe_notifications(uuid,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'public.set_author_recipe_notifications','media_helpers.set_author_recipe_notifications');
 definition:=replace(definition,'LANGUAGE plpgsql','LANGUAGE plpgsql SECURITY DEFINER');
 execute definition;
end; $move$;
revoke all on function media_helpers.set_author_recipe_notifications(uuid,boolean) from public,anon;
grant execute on function media_helpers.set_author_recipe_notifications(uuid,boolean) to authenticated;
create or replace function public.set_author_recipe_notifications(p_user_id uuid,p_enabled boolean) returns jsonb
language sql security invoker set search_path='' as $$ select media_helpers.set_author_recipe_notifications(p_user_id,p_enabled); $$;

-- Return only aggregate recipe statistics, never individual viewing timestamps.
create function media_helpers.view_count(p_id uuid) returns bigint language sql stable security definer set search_path='' as $$
 select case when blocking_helpers.recipe_accessible(p_id) then (select count(*) from public.recipe_views where recipe_id=p_id) else 0 end;
$$;
revoke all on function media_helpers.view_count(uuid) from public;
grant execute on function media_helpers.view_count(uuid) to anon,authenticated;
create function public.view_count(p_recipe public.recipes) returns bigint language sql stable security invoker set search_path='' as $$ select media_helpers.view_count(p_recipe.id); $$;
revoke all on function public.view_count(public.recipes) from public;
grant execute on function public.view_count(public.recipes) to anon,authenticated;
create function media_helpers.view_counts() returns table(recipe_id uuid,view_count bigint,recent_count bigint)
language sql stable security definer set search_path='' as $$
 select r.id,count(v.id),count(v.id) filter(where v.viewed_at>=now()-interval '30 days')
 from public.recipes r left join public.recipe_views v on v.recipe_id=r.id
 where blocking_helpers.recipe_accessible(r.id) group by r.id;
$$;
revoke all on function media_helpers.view_counts() from public;
grant execute on function media_helpers.view_counts() to anon,authenticated;
create function public.get_recipe_view_counts() returns table(recipe_id uuid,view_count bigint,recent_count bigint)
language sql stable security invoker set search_path='' as $$ select * from media_helpers.view_counts(); $$;
revoke all on function public.get_recipe_view_counts() from public;
grant execute on function public.get_recipe_view_counts() to anon,authenticated;
revoke select on public.recipe_views from anon,authenticated;

-- Keep existing user-ranking logic, replacing only the keyword privacy threshold.
do $patch$ declare definition text; begin
 select pg_get_functiondef('search_suggestion_helpers.get_search_suggestions(text)'::regprocedure) into definition;
 definition:=replace(definition,'group by e.normalized_query having count(*)>=2',
 $rules$group by e.normalized_query having count(distinct e.user_id)>=5
 and e.normalized_query ~ '^[[:alpha:] ''-]+$'
 and (exists(select 1 from public.tags t where lower(t.name)=e.normalized_query)
 or exists(select 1 from public.ingredients i where lower(i.name)=e.normalized_query))$rules$);
 execute definition;
end; $patch$;

create function media_helpers.dispatch() returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; endpoint text;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='retention_worker_secret';
 select replace(decrypted_secret,'/retention-worker','/recipe-asset-worker') into endpoint from vault.decrypted_secrets where name='retention_worker_url';
 if endpoint !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/recipe-asset-worker$' or secret is null then raise exception 'Worker not configured'; end if;
 return net.http_post(url=>endpoint,headers=>jsonb_build_object('Content-Type','application/json','X-Retention-Worker-Secret',secret),body=>'{}'::jsonb,timeout_milliseconds=>60000);
end; $$;
revoke all on function media_helpers.dispatch() from public,anon,authenticated,service_role;
create function media_helpers.status() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform operations_helpers.require_admin();
 return jsonb_build_object('pending',(select count(*) from media_helpers.disposals),
 'retry',(select count(*) from media_helpers.disposals where last_error is not null),
 'attention',(select count(*) from media_helpers.disposals where attempts>=5),
 'scheduled',exists(select 1 from cron.job where jobname='pickle-recipe-media-cleanup' and active));
end; $$;
revoke all on function media_helpers.status() from public,anon;
grant execute on function media_helpers.status() to authenticated;
create or replace function public.admin_retention_status() returns jsonb language sql stable security invoker set search_path='' as $$
 select retention_helpers.status()||jsonb_build_object('recipe_media',media_helpers.status());
$$;
notify pgrst,'reload schema';
