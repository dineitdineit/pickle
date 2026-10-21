-- Run inside BEGIN / ROLLBACK. No real object bytes are uploaded.
select set_config('test.sender',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.recipient',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.client',gen_random_uuid()::text,true);
select set_config('test.path',current_setting('test.sender')||'/'||current_setting('test.recipient')||'/'||current_setting('test.client')||'.jpg',true);
delete from public.user_blocks where (blocker_id=current_setting('test.sender')::uuid and blocked_id=current_setting('test.recipient')::uuid) or (blocker_id=current_setting('test.recipient')::uuid and blocked_id=current_setting('test.sender')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sender'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
insert into storage.objects(bucket_id,name,metadata) values('chat_images',current_setting('test.path'),'{"mimetype":"image/jpeg","size":100}'::jsonb);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.recipient'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='chat_images' and name=current_setting('test.path')) then raise exception 'Recipient read unsent upload'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sender'),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare sent jsonb; repeat jsonb; blocked boolean; begin
 sent:=public.send_direct_photo_message(current_setting('test.recipient')::uuid,'',current_setting('test.client')::uuid,current_setting('test.path'));
 repeat:=public.send_direct_photo_message(current_setting('test.recipient')::uuid,'',current_setting('test.client')::uuid,current_setting('test.path'));
 if sent->>'id'<>repeat->>'id' or sent->>'image_path'<>current_setting('test.path') or sent->>'body'<>'' then raise exception 'Photo message or retry incorrect'; end if;
 perform set_config('test.message',sent->>'id',true);
 blocked:=false;
 begin update public.direct_messages set image_path='other' where id=(sent->>'id')::bigint; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Photo path mutable'; end if;
 blocked:=false;
 begin perform public.send_direct_photo_message(current_setting('test.recipient')::uuid,'',gen_random_uuid(),current_setting('test.path')); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'Photo reused with wrong client'; end if;
 blocked:=false;
 begin perform public.send_direct_photo_message(current_setting('test.recipient')::uuid,'',gen_random_uuid(),current_setting('test.sender')||'/'||current_setting('test.recipient')||'/'||gen_random_uuid()||'.png'); exception when invalid_parameter_value then blocked:=true; end;
 if not blocked then raise exception 'Nonexistent upload accepted'; end if;
 if not exists(select 1 from public.direct_messages where image_path=current_setting('test.path')) then raise exception 'Delivered photo missing immutable message reference'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.recipient'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if not exists(select 1 from storage.objects where bucket_id='chat_images' and name=current_setting('test.path')) then raise exception 'Recipient cannot read delivered photo'; end if;
 if not exists(select 1 from public.get_message_inbox() where peer_id=current_setting('test.sender')::uuid and latest_body='Photo') then raise exception 'Inbox photo label missing'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false)::text,true);
do $$ declare blocked boolean:=false; begin
 if exists(select 1 from storage.objects where bucket_id='chat_images' and name=current_setting('test.path')) then raise exception 'Unrelated user read photo'; end if;
 begin insert into storage.objects(bucket_id,name) values('chat_images',current_setting('test.path')||'.svg'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Foreign / unsupported upload accepted'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sender'),'role','authenticated','is_anonymous',false)::text,true);
select public.set_user_block(current_setting('test.recipient')::uuid,true);
do $$ declare blocked boolean:=false; begin
 if exists(select 1 from storage.objects where bucket_id='chat_images' and name=current_setting('test.path')) then raise exception 'Blocked sender read photo'; end if;
 begin insert into storage.objects(bucket_id,name) values('chat_images',current_setting('test.sender')||'/'||current_setting('test.recipient')||'/'||gen_random_uuid()||'.png'); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Photo uploaded to blocked recipient'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.recipient'),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='chat_images' and name=current_setting('test.path')) then raise exception 'Blocked recipient read photo'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.sender'),'role','authenticated','is_anonymous',true)::text,true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='chat_images' and name=current_setting('test.path')) then raise exception 'Anonymous read photo'; end if;
end; $$;
reset role;
do $$ begin
 if not exists(select 1 from storage.buckets where id='chat_images' and public=false and file_size_limit=5242880 and allowed_mime_types=array['image/jpeg','image/png','image/webp']) then raise exception 'Private image bucket configuration incorrect'; end if;
end; $$;
select 'Private bucket, pending upload isolation, sender/recipient-only reads, blocked and anonymous restrictions, immutable paths, photo-only messages, idempotent retries and inbox photo labels passed' as result;
