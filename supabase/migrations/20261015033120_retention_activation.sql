create or replace function operations_helpers.case_context(p_case uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.moderation_cases; rid uuid; target jsonb; recipe jsonb;
begin
 perform operations_helpers.require_admin();
 select * into c from public.moderation_cases where id=p_case;
 if not found then raise exception 'Case unavailable' using errcode='P0002'; end if;
 if c.evidence_deleted_at is not null or (c.status='closed' and c.evidence_expires_at<=now() and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=c.id and a.status='open')) then raise exception 'Detailed case context expired' using errcode='42501'; end if;
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
create policy retention_backup_no_client_read on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'retention-backups');
create policy retention_backup_no_client_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'retention-backups');
create policy retention_backup_no_client_update on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'retention-backups') with check(bucket_id<>'retention-backups');
create policy retention_backup_no_client_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'retention-backups');

-- Continue deletion requests that started before the durable queue was introduced.
insert into retention_helpers.deletion_jobs(user_id,requested_at) select user_id,requested_at from operations_helpers.account_deletions on conflict(user_id) do nothing;
do $$ declare j record; begin for j in select id from retention_helpers.deletion_jobs where status<>'completed' loop perform retention_helpers.refresh_files(j.id); end loop; end; $$;

do $$ begin
 if not exists(select 1 from vault.secrets where name='retention_worker_url') then
 perform vault.create_secret('https://ztfwzwyyaaoexqtilpsw.supabase.co/functions/v1/retention-worker','retention_worker_url','Private retention worker URL');
 end if;
end; $$;

select cron.schedule('pickle-retention-worker','* * * * *','select retention_helpers.dispatch_worker();');
select cron.schedule('pickle-retention-purge','* * * * *','select retention_helpers.purge_records();');
