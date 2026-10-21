create table public.direct_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint direct_messages_no_self check (sender_id<>recipient_id),
  constraint direct_messages_client_unique unique(sender_id,client_id)
);
create index direct_messages_sender_recent on public.direct_messages(sender_id,id desc);
create index direct_messages_recipient_recent on public.direct_messages(recipient_id,id desc);
create index direct_messages_unread on public.direct_messages(recipient_id,sender_id) where read_at is null;
alter table public.direct_messages enable row level security;
revoke all on public.direct_messages from public,anon,authenticated;
grant select on public.direct_messages to authenticated;
grant insert(sender_id,recipient_id,client_id,body) on public.direct_messages to authenticated;
grant update(read_at) on public.direct_messages to authenticated;
grant usage on sequence public.direct_messages_id_seq to authenticated;
create policy direct_messages_participants_read on public.direct_messages for select to authenticated
using ((select auth.uid()) in (sender_id,recipient_id) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
create policy direct_messages_sender_insert on public.direct_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
create policy direct_messages_recipient_read_receipt on public.direct_messages for update to authenticated
using (recipient_id=(select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false))
with check (recipient_id=(select auth.uid()) and read_at is not null);

create function public.send_direct_message(p_recipient_id uuid,p_body text,p_client_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare uid uuid:=auth.uid(); content text:=btrim(p_body); existing public.direct_messages;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in to send messages' using errcode='42501'; end if;
  if p_recipient_id is null or p_recipient_id=uid or p_client_id is null or content is null or char_length(content) not between 1 and 3000 then raise exception 'Invalid message' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':dm',0));
  select * into existing from public.direct_messages where sender_id=uid and client_id=p_client_id;
  if found then
    if existing.recipient_id<>p_recipient_id or existing.body<>content then raise exception 'Message ID already used' using errcode='23505'; end if;
    return to_jsonb(existing);
  end if;
  insert into public.direct_messages(sender_id,recipient_id,client_id,body) values(uid,p_recipient_id,p_client_id,content) returning * into existing;
  return to_jsonb(existing);
end; $$;
revoke all on function public.send_direct_message(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.send_direct_message(uuid,text,uuid) to authenticated;

create function public.get_message_inbox()
returns table(peer_id uuid,username text,display_name text,avatar_url text,latest_body text,latest_at timestamptz,latest_id bigint,unread_count bigint)
language sql stable security invoker set search_path='' as $$
with scoped as (
  select m.*,case when m.sender_id=auth.uid() then m.recipient_id else m.sender_id end as peer
  from public.direct_messages m where auth.uid() in (m.sender_id,m.recipient_id)
), latest as (
  select distinct on (peer) peer,body,created_at,id from scoped order by peer,id desc
), unread as (
  select peer,count(*) filter (where recipient_id=auth.uid() and read_at is null) as unread_count from scoped group by peer
)
select p.id,p.username,p.display_name,p.avatar_url,l.body,l.created_at,l.id,u.unread_count
from latest l join unread u on u.peer=l.peer join public.profiles p on p.id=l.peer
order by l.id desc;
$$;
revoke all on function public.get_message_inbox() from public,anon,authenticated;
grant execute on function public.get_message_inbox() to authenticated;
alter publication supabase_realtime add table public.direct_messages;
