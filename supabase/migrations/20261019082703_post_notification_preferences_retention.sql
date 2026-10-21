create or replace function private.filter_activity_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare preference public.notification_preferences;
begin
 if new.kind not in('follow','new_recipe','recipe_comment','comment_reply','recipe_photo_post','post_comment','post_reply') then return new; end if;
 select * into preference from public.notification_preferences where user_id=new.recipient_id;
 if not found then return new; end if;
 if not preference.enabled or not (case
  when new.kind='follow' then preference.follows
  when new.kind='new_recipe' then preference.recipes
  when new.kind in('recipe_comment','recipe_photo_post','post_comment') then preference.comments
  else preference.replies end) then return null; end if;
 return new;
end $$;
revoke all on function private.filter_activity_notification() from public,anon,authenticated;
do $patch$ declare definition text; begin
 select pg_get_functiondef('retention_helpers.purge_records()'::regprocedure) into definition;
 if strpos(definition,'''recipe_photo_post''')=0 then raise exception 'Unexpected retention function'; end if;
 definition:=replace(definition,'''recipe_photo_post''','''recipe_photo_post'',''post_comment'',''post_reply''');
 execute definition;
end $patch$;
notify pgrst,'reload schema';
