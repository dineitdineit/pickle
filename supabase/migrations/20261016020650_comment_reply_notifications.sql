create schema comment_alert_helpers;
revoke all on schema comment_alert_helpers from public,anon,authenticated;
grant usage on schema comment_alert_helpers to authenticated;

alter table public.user_notifications add column comment_id uuid references public.recipe_comments(id) on delete cascade;
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications add constraint user_notifications_kind_check
 check(kind in('follow','new_recipe','moderation','recipe_comment','comment_reply'));
alter table public.user_notifications drop constraint user_notifications_recipe_check;
alter table public.user_notifications add constraint user_notifications_recipe_check check(
 (kind in('follow','moderation') and recipe_id is null and comment_id is null)
 or (kind='new_recipe' and recipe_id is not null and comment_id is null)
 or (kind in('recipe_comment','comment_reply') and recipe_id is not null and comment_id is not null));
create unique index user_notifications_comment_unique on public.user_notifications(recipient_id,comment_id)
 where kind in('recipe_comment','comment_reply');
create index user_notifications_comment_idx on public.user_notifications(comment_id) where comment_id is not null;

create function comment_alert_helpers.visible(p_comment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.recipe_comments c join public.recipes r on r.id=c.recipe_id
 join public.profiles actor on actor.id=c.user_id
 left join public.recipe_comments parent on parent.id=c.parent_comment_id
 where c.id=p_comment and c.moderation_status='active' and not actor.moderation_hidden
 and blocking_helpers.recipe_accessible(r.id) and not blocking_helpers.viewer_blocked(c.user_id)
 and (c.parent_comment_id is null or (parent.moderation_status='active' and not blocking_helpers.viewer_blocked(parent.user_id))));
$$;
revoke all on function comment_alert_helpers.visible(uuid) from public,anon;
grant execute on function comment_alert_helpers.visible(uuid) to authenticated;
create policy visible_comment_notifications on public.user_notifications as restrictive for select to authenticated
 using(kind not in('recipe_comment','comment_reply') or comment_alert_helpers.visible(comment_id));

create function comment_alert_helpers.notify_comment() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid; parent_owner uuid; recipient record;
begin
 if new.moderation_status<>'active' or auth.uid() is distinct from new.user_id
 or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return new; end if;
 select r.author_id into owner_id from public.recipes r where r.id=new.recipe_id and not r.is_hidden;
 if not found then return new; end if;
 if new.parent_comment_id is not null then
  select c.user_id into parent_owner from public.recipe_comments c
  where c.id=new.parent_comment_id and c.recipe_id=new.recipe_id and c.moderation_status='active';
  if not found then return new; end if;
 end if;
 for recipient in
  select distinct on (target) target,kind from (
   select owner_id target,'recipe_comment'::text kind,1 priority
   union all select parent_owner,'comment_reply',0
  ) targets where target is not null and target<>new.user_id order by target,priority
 loop
  -- The existing insert guard also serializes this actor/recipient pair with blocks.
  -- Do not notify someone who cannot access the recipe or parent comment.
  if not exists(select 1 from public.profiles p where p.id=recipient.target and not p.moderation_hidden)
   or exists(select 1 from operations_helpers.account_deletions d where d.user_id=recipient.target)
   or blocking_helpers.pair_blocked(recipient.target,new.user_id)
   or blocking_helpers.pair_blocked(recipient.target,owner_id)
   or (parent_owner is not null and blocking_helpers.pair_blocked(recipient.target,parent_owner)) then continue; end if;
  insert into public.user_notifications(recipient_id,actor_id,kind,recipe_id,comment_id)
  values(recipient.target,new.user_id,recipient.kind,new.recipe_id,new.id) on conflict do nothing;
 end loop;
 return new;
end; $$;
revoke all on function comment_alert_helpers.notify_comment() from public,anon,authenticated;
create trigger notify_recipe_comment after insert on public.recipe_comments
 for each row execute function comment_alert_helpers.notify_comment();

-- New social alerts retain references rather than copies of private/comment text.
-- Reuse the existing scheduled retention task and its 30-day notification expiry.
do $patch$ declare definition text; begin
 select pg_get_functiondef('retention_helpers.purge_records()'::regprocedure) into definition;
 if position('kind=''moderation''' in definition)=0 then raise exception 'Notification purge pattern changed'; end if;
 definition:=replace(definition,'kind=''moderation''','kind in(''moderation'',''recipe_comment'',''comment_reply'')');
 execute definition;
end; $patch$;
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications') then
  alter publication supabase_realtime add table public.user_notifications;
 end if;
end; $$;
notify pgrst,'reload schema';
