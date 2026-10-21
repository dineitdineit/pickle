create function post_helpers.notify_comment() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid; parent_owner uuid; recipient record;
begin
 if auth.uid() is distinct from new.user_id or new.deleted_at is not null or not operations_helpers.can_act('publish') then return new; end if;
 select author_id into owner_id from public.photo_posts where id=new.post_id;
 if owner_id is null or not post_helpers.public_post(new.post_id) then return new; end if;
 if new.parent_id is not null then
  select user_id into parent_owner from public.post_comments where id=new.parent_id and post_id=new.post_id and deleted_at is null;
 end if;
 for recipient in select distinct on(target) target,kind from (
  select owner_id target,'post_comment'::text kind,1 priority
  union all select parent_owner,'post_reply',0
 ) targets where target is not null and target<>new.user_id order by target,priority loop
  if not guardian_helpers.public_allowed(recipient.target)
   or not exists(select 1 from public.profiles where id=recipient.target and not moderation_hidden)
   or exists(select 1 from operations_helpers.account_deletions where user_id=recipient.target)
   or blocking_helpers.pair_blocked(recipient.target,new.user_id)
   or blocking_helpers.pair_blocked(recipient.target,owner_id)
   or (parent_owner is not null and blocking_helpers.pair_blocked(recipient.target,parent_owner)) then continue; end if;
  insert into public.user_notifications(recipient_id,actor_id,kind,post_id,post_comment_id)
  values(recipient.target,new.user_id,recipient.kind,new.post_id,new.id) on conflict do nothing;
 end loop;
 return new;
end $$;
revoke all on function post_helpers.notify_comment() from public,anon,authenticated;
create trigger notify_post_comment after insert on public.post_comments for each row execute function post_helpers.notify_comment();
