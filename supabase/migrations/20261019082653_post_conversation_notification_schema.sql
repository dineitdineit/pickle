alter table public.user_notifications add column post_comment_id uuid references public.post_comments(id) on delete cascade;
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check check(kind in('follow','new_recipe','moderation','recipe_comment','comment_reply','recipe_photo_post','post_comment','post_reply'));
alter table public.user_notifications drop constraint user_notifications_recipe_check;
alter table public.user_notifications add constraint user_notifications_recipe_check check(
 (kind in('follow','moderation') and recipe_id is null and comment_id is null and post_id is null and post_comment_id is null) or
 (kind='new_recipe' and recipe_id is not null and comment_id is null and post_id is null and post_comment_id is null) or
 (kind in('recipe_comment','comment_reply') and recipe_id is not null and comment_id is not null and post_id is null and post_comment_id is null) or
 (kind='recipe_photo_post' and recipe_id is not null and post_id is not null and comment_id is null and post_comment_id is null) or
 (kind in('post_comment','post_reply') and post_id is not null and post_comment_id is not null and recipe_id is null and comment_id is null));
create index user_notifications_post_comment_idx on public.user_notifications(post_comment_id) where post_comment_id is not null;
create unique index user_notifications_post_comment_unique on public.user_notifications(recipient_id,post_comment_id) where kind in('post_comment','post_reply');
create policy visible_post_conversation_notifications on public.user_notifications as restrictive for select to authenticated
 using(kind not in('post_comment','post_reply') or (created_at>now()-interval '30 days'
 and post_helpers.comment_visible(post_comment_id)
 and exists(select 1 from public.post_comments c where c.id=post_comment_id and c.post_id=user_notifications.post_id and c.deleted_at is null)));
