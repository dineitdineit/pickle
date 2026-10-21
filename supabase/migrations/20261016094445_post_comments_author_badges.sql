create table public.post_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.photo_posts(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 parent_id uuid references public.post_comments(id) on delete cascade,
 content text not null check(char_length(btrim(content)) between 1 and 2000),
 created_at timestamptz not null default now()
);
create index post_comments_post_threads on public.post_comments(post_id,created_at,id) where parent_id is null;
create index post_comments_parent on public.post_comments(parent_id,created_at,id) where parent_id is not null;
create index post_comments_user on public.post_comments(user_id);
alter table public.post_comments enable row level security;
revoke all on public.post_comments from public,anon,authenticated;
grant select on public.post_comments to anon,authenticated;

create function post_helpers.comment_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.post_comments c join public.profiles a on a.id=c.user_id
 where c.id=p_id and post_helpers.public_post(c.post_id) and guardian_helpers.public_allowed(a.id)
 and not a.moderation_hidden and not blocking_helpers.viewer_blocked(a.id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=a.id)
 and (c.parent_id is null or exists(select 1 from public.post_comments root join public.profiles ra on ra.id=root.user_id
 where root.id=c.parent_id and root.post_id=c.post_id and root.parent_id is null
 and not ra.moderation_hidden and guardian_helpers.public_allowed(ra.id) and not blocking_helpers.viewer_blocked(ra.id)
 and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=ra.id))));
$$;
revoke all on function post_helpers.comment_visible(uuid) from public;
grant execute on function post_helpers.comment_visible(uuid) to anon,authenticated;
create policy visible_post_comments on public.post_comments for select to anon,authenticated using(post_helpers.comment_visible(id));


