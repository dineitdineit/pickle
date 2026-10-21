create function retention_helpers.dispatch_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare secret text; project_url text;
begin
 select decrypted_secret into secret from vault.decrypted_secrets where name='retention_worker_secret';
 if secret is null then raise exception 'Retention scheduler not configured'; end if;
 -- Project-specific URL is configured below; no API key/secret is stored in cron text.
 select decrypted_secret into project_url from vault.decrypted_secrets where name='retention_worker_url';
 if project_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/retention-worker$' or project_url is null then raise exception 'Retention URL not configured'; end if;
 return net.http_post(url=>project_url,headers=>jsonb_build_object('Content-Type','application/json','X-Retention-Worker-Secret',secret),body=>'{}'::jsonb,timeout_milliseconds=>60000);
end; $$;
revoke all on function retention_helpers.dispatch_worker() from public,anon,authenticated,service_role;

-- Use expiry-aware RPC even between physical purge batches.
create or replace function public.get_moderation_case_context(p_case uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if exists(select 1 from public.moderation_cases c where id=p_case and (evidence_deleted_at is not null or (status='closed' and evidence_expires_at<=now() and not exists(select 1 from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where d.case_id=c.id and a.status='open')))) then
  raise exception 'Detailed case context has expired under the retention policy' using errcode='42501';
 end if;
 return operations_helpers.case_context(p_case);
end; $$;
