update storage.buckets set public=false where id='community_recipe_images';
select cron.schedule('pickle-recipe-media-cleanup','* * * * *','select media_helpers.dispatch();');
notify pgrst,'reload schema';
