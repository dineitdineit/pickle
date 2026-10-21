create function moderation_helpers.admin_moderation_email_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare counts jsonb; failures jsonb; ready boolean;
begin
 if auth.uid() is null or not private.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Admin access required' using errcode='42501'; end if;
 select coalesce(jsonb_object_agg(status,total),'{}'::jsonb) into counts from (select status,count(*) as total from moderation_helpers.email_outbox group by status) s;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into failures from (
  select id,status,last_error,created_at from moderation_helpers.email_outbox where status in ('failed','skipped') order by created_at desc,id limit 10
 ) q;
 select exists(select 1 from vault.secrets where name='moderation_worker_url') and exists(select 1 from vault.secrets where name='moderation_worker_secret') into ready;
 return jsonb_build_object('counts',counts,'recent_failures',failures,'scheduler_configured',ready);
end; $$;
revoke all on function moderation_helpers.admin_moderation_email_status() from public,anon,authenticated;
grant execute on function moderation_helpers.admin_moderation_email_status() to authenticated;
create function public.admin_moderation_email_status() returns jsonb language sql stable security invoker set search_path='' as $$ select moderation_helpers.admin_moderation_email_status(); $$;
revoke all on function public.admin_moderation_email_status() from public,anon,authenticated;
grant execute on function public.admin_moderation_email_status() to authenticated;
