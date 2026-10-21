create table public.notification_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default true,
 follows boolean not null default true,
 recipes boolean not null default true,
 comments boolean not null default true,
 replies boolean not null default true
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
create policy read_own_notification_preferences on public.notification_preferences for select to authenticated
 using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
create policy insert_own_notification_preferences on public.notification_preferences for insert to authenticated
 with check(user_id=(select auth.uid()) and operations_helpers.can_act('profile'));
create policy update_own_notification_preferences on public.notification_preferences for update to authenticated
 using(user_id=(select auth.uid()) and operations_helpers.can_act('profile'))
 with check(user_id=(select auth.uid()) and operations_helpers.can_act('profile'));
create function private.filter_activity_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare preference public.notification_preferences;
begin
 -- Safety/moderation notices and service emails are never muted here.
 if new.kind not in('follow','new_recipe','recipe_comment','comment_reply') then return new; end if;
 select * into preference from public.notification_preferences where user_id=new.recipient_id;
 if not found then return new; end if;
 if not preference.enabled or not (case new.kind when 'follow' then preference.follows when 'new_recipe' then preference.recipes when 'recipe_comment' then preference.comments else preference.replies end) then return null; end if;
 return new;
end; $$;
revoke all on function private.filter_activity_notification() from public,anon,authenticated;
create trigger filter_activity_notification before insert on public.user_notifications for each row execute function private.filter_activity_notification();
notify pgrst,'reload schema';
