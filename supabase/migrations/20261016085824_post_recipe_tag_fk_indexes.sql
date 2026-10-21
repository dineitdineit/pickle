-- FK cleanup must also index rows outside the published-only discovery index.
create index photo_posts_recipe_fk on public.photo_posts(recipe_id) where recipe_id is not null;
create index user_notifications_post_fk on public.user_notifications(post_id) where post_id is not null;
