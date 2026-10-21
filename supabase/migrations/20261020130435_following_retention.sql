-- Caller RLS applies to both branches. Keyset ordering includes kind so the
-- same UUID used in both content tables cannot skip an item at a page boundary.
create function public.following_feed(p_before timestamptz default null,p_before_kind text default null,p_before_id uuid default null,p_limit integer default 12)
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
 case when c.kind='recipe' then (select jsonb_build_object('id',r.id,'title',r.title,'cover_image',r.cover_image,'short_description',r.short_description,'video_url',r.video_url,'like_count',r.like_count,'view_count',(select count(*) from public.recipe_views v where v.recipe_id=r.id)) from public.recipes r where r.id=c.id)
 else (select jsonb_build_object('id',p.id,'author_id',p.author_id,'caption',p.caption,'published_at',p.published_at,'is_hidden',false,'recipe_id',p.recipe_id,
 'author',jsonb_build_object('display_name',a.display_name,'username',a.username,'avatar_url',a.avatar_url),
 'photos',coalesce((select jsonb_agg(jsonb_build_object('id',ph.id,'image_path',ph.image_path,'position',ph.position) order by ph.position) from public.post_photos ph where ph.post_id=p.id),'[]'::jsonb)) from public.photo_posts p join public.profiles a on a.id=p.author_id where p.id=c.id) end
 from page c order by c.posted_at desc,c.kind desc,c.id desc;
end$$;
revoke all on function public.following_feed(timestamptz,text,uuid,integer) from public,anon;
grant execute on function public.following_feed(timestamptz,text,uuid,integer) to authenticated;
create index if not exists recipes_author_recent_idx on public.recipes(author_id,created_at desc,id desc) where not is_hidden and not moderation_removed;
create index if not exists posts_author_recent_idx on public.photo_posts(author_id,published_at desc,id desc) where status='published' and not is_hidden;

create schema if not exists engagement_helpers;
revoke all on schema engagement_helpers from public,anon,authenticated;
create table engagement_helpers.saved_activity(
 user_id uuid not null references auth.users(id) on delete cascade,
 recipe_id uuid not null references public.recipes(id) on delete cascade,
 kind text not null check(kind in('saved_return','cooked')),
 day date not null default (now() at time zone 'UTC')::date,
 saved_at timestamptz not null,
 created_at timestamptz not null default now(),
 primary key(user_id,recipe_id,kind,day)
);
alter table engagement_helpers.saved_activity enable row level security;
revoke all on engagement_helpers.saved_activity from public,anon,authenticated;
create index saved_activity_expiry_idx on engagement_helpers.saved_activity(created_at);
-- A narrow private definer writes only the caller's existing accessible save;
-- clients cannot supply an actor, time, kind or arbitrary event properties.
create function public.record_saved_recipe_return(p_recipe uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not operations_helpers.can_act('social') then return; end if;
 insert into engagement_helpers.saved_activity(user_id,recipe_id,kind,saved_at)
 select s.user_id,s.recipe_id,'saved_return',s.created_at from public.saved_recipes s
 where s.user_id=auth.uid() and s.recipe_id=p_recipe
 and (s.created_at at time zone 'UTC')::date<(now() at time zone 'UTC')::date
 and blocking_helpers.recipe_accessible(s.recipe_id)
 and exists(select 1 from public.recipes r where r.id=s.recipe_id and not r.moderation_removed)
 on conflict do nothing;
end$$;
revoke all on function public.record_saved_recipe_return(uuid) from public,anon;
grant execute on function public.record_saved_recipe_return(uuid) to authenticated;
create function engagement_helpers.record_cooked() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cook_state='cooked' and old.cook_state is distinct from 'cooked' then
 insert into engagement_helpers.saved_activity(user_id,recipe_id,kind,saved_at) values(new.user_id,new.recipe_id,'cooked',new.created_at) on conflict do nothing;
 end if; return new;
end$$;
revoke all on function engagement_helpers.record_cooked() from public,anon,authenticated;
create trigger record_saved_cooked after update of cook_state on public.saved_recipes for each row execute function engagement_helpers.record_cooked();
select cron.schedule('pickle-engagement-expiry','23 * * * *',$job$delete from engagement_helpers.saved_activity where created_at<=now()-interval '30 days';$job$);

create function public.admin_retention_metrics(p_days integer default 30) returns jsonb
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
 and guardian_helpers.public_allowed(a.id) and guardian_helpers.public_allowed(b.id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id in(a.id,b.id))
 ), responses as (
 select p.*,exists(select 1 from public.post_comments c where c.post_id=p.id and c.deleted_at is null and c.user_id<>p.author_id
 and guardian_helpers.public_allowed(c.user_id) and not exists(select 1 from public.user_blocks b where (b.blocker_id=p.author_id and b.blocked_id=c.user_id) or (b.blocked_id=p.author_id and b.blocker_id=c.user_id))) other_response,
 (p.recipe_author_reacted or exists(select 1 from public.post_comments c where c.post_id=p.id and c.deleted_at is null and c.user_id=p.recipe_author)) author_response
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
