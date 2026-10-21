-- Reuse the existing public safety-version refresh for public post content.
-- Private-message visibility uses its own inbox/chat refresh and RLS, avoiding
-- a global public change signal for private-message moderation.
create trigger moderation_visibility_refresh after update on public.photo_posts for each row execute function operations_helpers.bump_visibility();
create trigger moderation_visibility_refresh after update on public.post_comments for each row execute function operations_helpers.bump_visibility();
notify pgrst,'reload schema';
