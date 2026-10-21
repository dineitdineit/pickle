create schema message_helpers;
revoke all on schema message_helpers from public,anon,authenticated;
grant usage on schema message_helpers to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('chat_images','chat_images',false,5242880,array['image/jpeg','image/png','image/webp']);
alter table public.direct_messages add column image_path text;
alter table public.direct_messages drop constraint direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check check(char_length(btrim(body))<=3000 and (char_length(btrim(body))>0 or image_path is not null));
create unique index direct_messages_image_unique on public.direct_messages(image_path) where image_path is not null;
grant insert(image_path) on public.direct_messages to authenticated;

create function message_helpers.can_upload_photo(p_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare recipient uuid; client uuid; segments text[];
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then return false; end if;
 segments:=string_to_array(p_name,'/');
 if array_length(segments,1)<>3 or segments[1]<>auth.uid()::text or segments[3] !~ '^[0-9a-f-]{36}[.](jpg|png|webp)$' then return false; end if;
 begin recipient:=segments[2]::uuid;client:=split_part(segments[3],'.',1)::uuid; exception when invalid_text_representation then return false; end;
 return recipient<>auth.uid() and exists(select 1 from public.profiles where id=recipient) and not blocking_helpers.pair_blocked(auth.uid(),recipient);
end; $$;
revoke all on function message_helpers.can_upload_photo(text) from public,anon,authenticated;
grant execute on function message_helpers.can_upload_photo(text) to authenticated;
create policy chat_photo_upload on storage.objects for insert to authenticated with check(bucket_id='chat_images' and message_helpers.can_upload_photo(name));
create policy chat_photo_read on storage.objects for select to authenticated using(bucket_id='chat_images' and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false) and
 (message_helpers.can_upload_photo(name) or exists(select 1 from public.direct_messages m where m.image_path=name and (m.sender_id=(select auth.uid()) or m.recipient_id=(select auth.uid())))));
create policy chat_photo_delete_unsent on storage.objects for delete to authenticated using(bucket_id='chat_images' and split_part(name,'/',1)=(select auth.uid())::text and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false) and not exists(select 1 from public.direct_messages m where m.image_path=name));

create function message_helpers.validate_photo_message() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.image_path is null then return new; end if;
 if new.image_path !~ '[.](jpg|png|webp)$' or new.image_path<>new.sender_id::text||'/'||new.recipient_id::text||'/'||new.client_id::text||'.'||split_part(new.image_path,'.',2) then raise exception 'Invalid photo path' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id='chat_images' and name=new.image_path) then raise exception 'Upload the photo first' using errcode='22023'; end if;
 return new;
end; $$;
revoke all on function message_helpers.validate_photo_message() from public,anon,authenticated;
create trigger validate_direct_message_photo before insert on public.direct_messages for each row execute function message_helpers.validate_photo_message();
create function public.send_direct_photo_message(p_recipient_id uuid,p_body text,p_client_id uuid,p_image_path text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); content text:=btrim(coalesce(p_body,'')); existing public.direct_messages;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to send messages' using errcode='42501'; end if;
 if p_recipient_id is null or p_recipient_id=uid or p_client_id is null or p_image_path is null or char_length(content)>3000 then raise exception 'Invalid photo message' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('block:'||least(uid,p_recipient_id)::text||':'||greatest(uid,p_recipient_id)::text,0));
 perform pg_advisory_xact_lock(hashtextextended(uid::text||':dm',0));
 select * into existing from public.direct_messages where sender_id=uid and client_id=p_client_id;
 if found then
  if existing.recipient_id<>p_recipient_id or existing.body<>content or existing.image_path is distinct from p_image_path then raise exception 'Message ID already used' using errcode='23505'; end if;
  return to_jsonb(existing);
 end if;
 insert into public.direct_messages(sender_id,recipient_id,client_id,body,image_path) values(uid,p_recipient_id,p_client_id,content,p_image_path) returning * into existing;
 return to_jsonb(existing);
end; $$;
revoke all on function public.send_direct_photo_message(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.send_direct_photo_message(uuid,text,uuid,text) to authenticated;
create or replace function public.get_message_inbox()
returns table(peer_id uuid,username text,display_name text,avatar_url text,latest_body text,latest_at timestamptz,latest_id bigint,unread_count bigint)
language sql stable security invoker set search_path='' as $$
with scoped as (
 select m.*,case when m.sender_id=auth.uid() then m.recipient_id else m.sender_id end as peer
 from public.direct_messages m where auth.uid() in (m.sender_id,m.recipient_id)
), latest as (
 select distinct on (peer) peer,case when image_path is not null then case when body='' then 'Photo' else 'Photo · '||body end else body end as body,created_at,id from scoped order by peer,id desc
), unread as (
 select peer,count(*) filter(where recipient_id=auth.uid() and read_at is null) as unread_count from scoped group by peer
)
select p.id,p.username,p.display_name,p.avatar_url,l.body,l.created_at,l.id,u.unread_count
from latest l join unread u on u.peer=l.peer join public.profiles p on p.id=l.peer order by l.id desc;
$$;
