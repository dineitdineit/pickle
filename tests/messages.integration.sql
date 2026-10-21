-- Run in a transaction; no test message is retained.
select set_config('test.dm_sender',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.dm_recipient',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.dm_client',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dm_sender'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare sent jsonb; repeated jsonb; blocked boolean; begin
  sent:=public.send_direct_message(current_setting('test.dm_recipient')::uuid,'  Hello test  ',current_setting('test.dm_client')::uuid);
  repeated:=public.send_direct_message(current_setting('test.dm_recipient')::uuid,'Hello test',current_setting('test.dm_client')::uuid);
  if sent->>'id'<>repeated->>'id' or sent->>'body'<>'Hello test' then raise exception 'Idempotent retry or trim failed'; end if;
  perform set_config('test.dm_id',sent->>'id',true);
  blocked:=false;
  begin perform public.send_direct_message(current_setting('test.dm_recipient')::uuid,'Different',current_setting('test.dm_client')::uuid); exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'Client ID reused with different body'; end if;
  blocked:=false;
  begin perform public.send_direct_message(auth.uid(),'Self',gen_random_uuid()); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'Self message accepted'; end if;
  blocked:=false;
  begin perform public.send_direct_message(current_setting('test.dm_recipient')::uuid,'   ',gen_random_uuid()); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'Blank message accepted'; end if;
  blocked:=false;
  begin perform public.send_direct_message(current_setting('test.dm_recipient')::uuid,repeat('x',3001),gen_random_uuid()); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'Oversized message accepted'; end if;
  update public.direct_messages set read_at=now() where id=current_setting('test.dm_id')::bigint;
  if found then raise exception 'Sender marked own message read'; end if;
  blocked:=false;
  begin update public.direct_messages set body='Changed' where id=current_setting('test.dm_id')::bigint; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Body update permitted'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dm_recipient'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare item record; begin
  select * into item from public.get_message_inbox() where peer_id=current_setting('test.dm_sender')::uuid;
  if item.unread_count<1 then raise exception 'Inbox missed unread message'; end if;
  update public.direct_messages set read_at=now() where id=current_setting('test.dm_id')::bigint;
  if not found then raise exception 'Recipient could not mark read'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
  if exists(select 1 from public.direct_messages where id=current_setting('test.dm_id')::bigint) or exists(select 1 from public.get_message_inbox()) then raise exception 'Unrelated user read private messages'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.dm_sender'),'role','authenticated','is_anonymous',true)::text,true);
do $$ declare blocked boolean:=false; begin
  if exists(select 1 from public.direct_messages) then raise exception 'Anonymous sign-in read messages'; end if;
  begin perform public.send_direct_message(current_setting('test.dm_recipient')::uuid,'Anonymous',gen_random_uuid()); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Anonymous sign-in sent a message'; end if;
end; $$;
reset role;
set local role anon;
do $$ declare blocked boolean:=false; begin
  begin perform 1 from public.direct_messages; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Signed-out access allowed'; end if;
end; $$;
reset role;
select 'Participant privacy, anonymous restrictions, immutable content, recipient receipts, validation and idempotency passed' as result;
