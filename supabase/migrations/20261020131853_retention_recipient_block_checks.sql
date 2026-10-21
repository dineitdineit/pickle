-- The report evaluates visibility for each result author, not the admin viewer.
create or replace function engagement_helpers.response_available(p_comment uuid,p_recipient uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.post_comments c join public.profiles a on a.id=c.user_id
 where c.id=p_comment and c.deleted_at is null and not a.moderation_hidden and guardian_helpers.public_allowed(a.id)
 and not exists(select 1 from public.user_blocks ub where (ub.blocker_id=a.id and ub.blocked_id=p_recipient) or (ub.blocked_id=a.id and ub.blocker_id=p_recipient))
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=a.id)
 and (c.parent_id is null or exists(select 1 from public.post_comments root join public.profiles ra on ra.id=root.user_id
 where root.id=c.parent_id and root.post_id=c.post_id and not ra.moderation_hidden and guardian_helpers.public_allowed(ra.id)
 and not exists(select 1 from public.user_blocks ub where (ub.blocker_id=ra.id and ub.blocked_id=p_recipient) or (ub.blocked_id=ra.id and ub.blocker_id=p_recipient))
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=ra.id))));
$$;
revoke all on function engagement_helpers.response_available(uuid,uuid) from public,anon,authenticated;
create or replace function engagement_helpers.admin_retention_metrics(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare since timestamptz; answer jsonb;
begin
 if not private.is_admin() then raise exception 'Admin only' using errcode='42501'; end if;
 if p_days is null or p_days not in(7,30) then raise exception 'Invalid reporting window' using errcode='22023'; end if;
 since:=now()-make_interval(days=>p_days);
 with eligible as (
 select s.* from public.saved_recipes s where s.created_at>=since and (s.created_at at time zone 'UTC')::date<(now() at time zone 'UTC')::date
 ), returned as (
 select distinct e.user_id,e.recipe_id,e.saved_at from engagement_helpers.saved_activity e where e.kind='saved_return' and e.created_at>=since
 ), results as (
 select p.id,p.author_id,r.author_id recipe_author,p.recipe_author_reacted from public.photo_posts p join public.recipes r on r.id=p.recipe_id
 join public.profiles a on a.id=p.author_id join public.profiles b on b.id=r.author_id
 where p.status='published' and not p.is_hidden and p.published_at>=since and p.author_id<>r.author_id
 and not r.is_hidden and not r.moderation_removed and not a.moderation_hidden and not b.moderation_hidden
 and guardian_helpers.public_allowed(a.id) and guardian_helpers.public_allowed(b.id) and not exists(select 1 from public.user_blocks ub where (ub.blocker_id=a.id and ub.blocked_id=b.id) or (ub.blocked_id=a.id and ub.blocker_id=b.id))
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id in(a.id,b.id))
 ), responses as (
 select p.*,exists(select 1 from public.post_comments c where c.post_id=p.id and c.user_id<>p.author_id and engagement_helpers.response_available(c.id,p.author_id)) other_response,
 (p.recipe_author_reacted or exists(select 1 from public.post_comments c where c.post_id=p.id and c.user_id=p.recipe_author and engagement_helpers.response_available(c.id,p.author_id))) author_response
 from results p
 ) select jsonb_build_object('days',p_days,'generated_at',now(),
 'eligible_saved_pairs',(select count(*) from eligible),
 'returned_saved_pairs',(select count(*) from eligible s join returned e on (e.user_id,e.recipe_id,e.saved_at)=(s.user_id,s.recipe_id,s.created_at)),
 'returning_savers',(select count(distinct user_id) from returned),
 'cooks_marking_cooked',(select count(distinct user_id) from engagement_helpers.saved_activity where kind='cooked' and created_at>=since),
 'result_posts',(select count(*) from results),'result_publishers',(select count(distinct author_id) from results),
 'results_with_response',(select count(*) from responses where other_response or author_response),
 'results_with_author_response',(select count(*) from responses where author_response)) into answer;
 return answer;
end$$;
revoke all on function engagement_helpers.admin_retention_metrics(integer) from public,anon;
grant execute on function engagement_helpers.admin_retention_metrics(integer) to authenticated;
notify pgrst,'reload schema';
