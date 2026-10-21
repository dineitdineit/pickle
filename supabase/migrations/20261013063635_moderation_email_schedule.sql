create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- Secrets are configured in Vault, never in migrations or cron command text.
create function moderation_helpers.dispatch_email_worker() returns boolean
language plpgsql security definer set search_path='' as $$
declare worker_url text; worker_secret text;
begin
 if not exists(select 1 from moderation_helpers.email_outbox where (status in ('pending','retry') and next_attempt_at<=now()) or (status='processing' and lease_until<now())) then return false; end if;
 select decrypted_secret into worker_url from vault.decrypted_secrets where name='moderation_worker_url' limit 1;
 select decrypted_secret into worker_secret from vault.decrypted_secrets where name='moderation_worker_secret' limit 1;
 if worker_url is null or worker_secret is null or char_length(worker_secret)<32 then return false; end if;
 if worker_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/moderation-email-worker$' then return false; end if;
 perform net.http_post(url=>worker_url,headers=>jsonb_build_object('Content-Type','application/json','X-Moderation-Worker-Secret',worker_secret),body=>'{}'::jsonb,timeout_milliseconds=>60000);
 return true;
end; $$;
revoke all on function moderation_helpers.dispatch_email_worker() from public,anon,authenticated,service_role;
select cron.schedule('pickle-moderation-email-worker','* * * * *','select moderation_helpers.dispatch_email_worker();');
