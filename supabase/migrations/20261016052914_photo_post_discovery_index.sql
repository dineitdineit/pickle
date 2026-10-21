-- Bounded global discovery ordered by publish time, with an ID tie breaker.
-- Author-scoped profile reads retain the existing author feed index.
create index photo_posts_discovery_feed
on public.photo_posts(published_at desc,id desc)
where status='published' and not is_hidden;
