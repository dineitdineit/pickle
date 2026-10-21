grant usage on schema moderation_helpers to service_role;
create function moderation_helpers.claim_moderation_emails(p_sender text,p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Worker access required' using errcode='42501'; end if;
 if p_sender is null or char_length(p_sender)>200 or p_sender !~ '^[^<>[:space:]]+@[^<>[:space:]]+[.][^<>[:space:]]+$' or p_limit is null or p_limit<1 or p_limit>10 then raise exception 'Invalid worker configuration'; end if;
 -- Stop ambiguous retries before the provider's 24-hour deduplication window ends.
 update moderation_helpers.email_outbox set status='failed',last_error='delivery_window_expired',lease_token=null,lease_until=null
 where status in ('processing','retry') and first_attempt_at<now()-interval '23 hours' and (lease_until is null or lease_until<now());
 update moderation_helpers.email_outbox q set status='skipped',last_error='no_verified_email'
 where q.status in ('pending','retry') and q.recipient_email is null and not exists(
 select 1 from auth.users u where u.id=q.recipient_id and u.email_confirmed_at is not null and nullif(btrim(u.email),'') is not null);
 with due as (
  select q.id from moderation_helpers.email_outbox q
  where ((q.status in ('pending','retry') and q.next_attempt_at<=now()) or (q.status='processing' and q.lease_until<now()))
  and q.attempts<8
  order by q.next_attempt_at,q.created_at,q.id for update skip locked limit p_limit
 ), claimed as (
  update moderation_helpers.email_outbox q set
   status='processing',attempts=q.attempts+1,first_attempt_at=coalesce(q.first_attempt_at,now()),
   lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',
   sender=coalesce(q.sender,btrim(p_sender)),
   recipient_email=coalesce(q.recipient_email,(select u.email from auth.users u where u.id=q.recipient_id and u.email_confirmed_at is not null))
  from due where q.id=due.id
  returning q.id,q.lease_token,q.recipient_email as to_email,q.sender,q.subject,q.body
 )
 select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
 update moderation_helpers.email_outbox set status='failed',last_error='attempt_limit',lease_token=null,lease_until=null
 where status='processing' and attempts>=8 and lease_until<now();
 return result;
end; $$;
revoke all on function moderation_helpers.claim_moderation_emails(text,integer) from public,anon,authenticated;
grant execute on function moderation_helpers.claim_moderation_emails(text,integer) to service_role;
create function public.claim_moderation_emails(p_sender text,p_limit integer default 5) returns jsonb
language sql security invoker set search_path='' as $$ select moderation_helpers.claim_moderation_emails(p_sender,p_limit); $$;
revoke all on function public.claim_moderation_emails(text,integer) from public,anon,authenticated;
grant execute on function public.claim_moderation_emails(text,integer) to service_role;

create function moderation_helpers.finish_moderation_email(p_id uuid,p_lease uuid,p_outcome text,p_provider_id text default null,p_error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Worker access required' using errcode='42501'; end if;
 if p_outcome is null or p_outcome not in ('sent','retry','failed') or char_length(coalesce(p_provider_id,''))>200 or char_length(coalesce(p_error,''))>80 or (p_outcome='sent' and nullif(p_provider_id,'') is null) then raise exception 'Invalid delivery result'; end if;
 update moderation_helpers.email_outbox set
  status=case when p_outcome='retry' and attempts>=8 then 'failed' else p_outcome end,
  provider_id=case when p_outcome='sent' then p_provider_id else provider_id end,
  last_error=case when p_outcome='sent' then null else p_error end,
  sent_at=case when p_outcome='sent' then now() else sent_at end,
  next_attempt_at=now()+make_interval(secs=>least(3600,60*power(2,attempts)::integer)),
  lease_token=null,lease_until=null
 where id=p_id and lease_token=p_lease and status='processing';
 return found;
end; $$;
revoke all on function moderation_helpers.finish_moderation_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function moderation_helpers.finish_moderation_email(uuid,uuid,text,text,text) to service_role;
create function public.finish_moderation_email(p_id uuid,p_lease uuid,p_outcome text,p_provider_id text default null,p_error text default null) returns boolean
language sql security invoker set search_path='' as $$ select moderation_helpers.finish_moderation_email(p_id,p_lease,p_outcome,p_provider_id,p_error); $$;
revoke all on function public.finish_moderation_email(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_moderation_email(uuid,uuid,text,text,text) to service_role;
