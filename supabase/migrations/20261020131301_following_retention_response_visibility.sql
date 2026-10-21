create or replace function public.following_feed(p_before timestamptz default null,p_before_kind text default null,p_before_id uuid default null,p_limit integer default 12)
returns table(id uuid,kind text,posted_at timestamptz,author_id uuid,author_name text,payload jsonb)
language plpgsql stable security invoker set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to see followed cooks' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 30 or
 ((p_before is null)::integer+(p_before_kind is null)::integer+(p_before_id is null)::integer) not in(0,3) or
 (p_before_kind is not null and p_before_kind not in('recipe','post')) then raise exception 'Invalid feed cursor' using errcode='22023'; end if;
 return query with candidates as (
 select r.id,'recipe'::text kind,r.created_at posted_at,r.author_id,a.display_name::text author_name
 from public.user_follows f join public.recipes r on r.author_id=f.followed_id join public.profiles a on a.id=r.author_id
 where f.follower_id=(select auth.uid()) and not r.is_hidden and not r.moderation_removed and not a.moderation_hidden
 and guardian_helpers.public_allowed(a.id) and not blocking_helpers.viewer_blocked(a.id)
 union all
 select p.id,'post'::text,p.published_at,p.author_id,a.display_name::text
 from public.user_follows f join public.photo_posts p on p.author_id=f.followed_id join public.profiles a on a.id=p.author_id
 where f.follower_id=(select auth.uid()) and p.status='published' and not p.is_hidden and not a.moderation_hidden
 and guardian_helpers.public_allowed(a.id) and not blocking_helpers.viewer_blocked(a.id)
 ), page as (
 select c.* from candidates c where p_before is null or (c.posted_at,c.kind,c.id)<(p_before,p_before_kind,p_before_id)
 order by c.posted_at desc,c.kind desc,c.id desc limit p_limit+1
 )
 select c.id,c.kind,c.posted_at,c.author_id,coalesce(c.author_name,'Pickle user'),
 case when c.kind='recipe' then (select jsonb_build_object('id',r.id,'title',r.title,'cover_image',r.cover_image,'short_description',r.short_description,'video_url',r.video_url,'like_count',r.like_count,'view_count',public.view_count(r)) from public.recipes r where r.id=c.id)
 else (select jsonb_build_object('id',p.id,'author_id',p.author_id,'caption',p.caption,'published_at',p.published_at,'is_hidden',false,'recipe_id',p.recipe_id,
 'author',jsonb_build_object('display_name',a.display_name,'username',a.username,'avatar_url',a.avatar_url),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('id',ph.id,'image_path',ph.image_path,'position',ph.position) order by ph.position) from public.post_photos ph where ph.post_id=p.id),'[]'::jsonb)) from public.photo_posts p join public.profiles a on a.id=p.author_id where p.id=c.id) end
 from page c order by c.posted_at desc,c.kind desc,c.id desc;
end$$;
revoke all on function public.following_feed(timestamptz,text,uuid,integer) from public,anon;
grant execute on function public.following_feed(timestamptz,text,uuid,integer) to authenticated;

-- The report evaluates visibility for each result author, not the admin viewer.
create function engagement_helpers.response_available(p_comment uuid,p_recipient uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.post_comments c join public.profiles a on a.id=c.user_id
 where c.id=p_comment and c.deleted_at is null and not a.moderation_hidden and guardian_helpers.public_allowed(a.id)
 and not blocking_helpers.pair_blocked(a.id,p_recipient)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=a.id)
 and (c.parent_id is null or exists(select 1 from public.post_comments root join public.profiles ra on ra.id=root.user_id
 where root.id=c.parent_id and root.post_id=c.post_id and not ra.moderation_hidden and guardian_helpers.public_allowed(ra.id)
 and not blocking_helpers.pair_blocked(ra.id,p_recipient)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=ra.id))));
$$;
revoke all on function engagement_helpers.response_available(uuid,uuid) from public,anon,authenticated;
create or replace function public.admin_retention_metrics(p_days integer default 30) returns jsonb
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
 and guardian_helpers.public_allowed(a.id) and guardian_helpers.public_allowed(b.id) and not blocking_helpers.pair_blocked(a.id,b.id)
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
revoke all on function public.admin_retention_metrics(integer) from public,anon;
grant execute on function public.admin_retention_metrics(integer) to authenticated;
notify pgrst,'reload schema';
