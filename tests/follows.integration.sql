-- Run inside BEGIN / ROLLBACK so all test changes are discarded.
select set_config('test.follower',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.followed',(select id::text from public.profiles order by id offset 1 limit 1),true);
delete from public.user_follows where follower_id=current_setting('test.follower')::uuid and followed_id=current_setting('test.followed')::uuid;
delete from public.user_notifications where actor_id=current_setting('test.follower')::uuid and recipient_id=current_setting('test.followed')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.follower'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$
declare target uuid:=current_setting('test.followed')::uuid; result jsonb; blocked boolean;
begin
  if target is null then raise exception 'Test needs two profiles'; end if;
  result:=public.set_user_follow(target,true);
  if result->>'following'<>'true' or result->>'user_id'<>target::text then raise exception 'Follow not confirmed'; end if;
  perform public.set_user_follow(target,true);
  if (select count(*) from public.user_follows where follower_id=auth.uid() and followed_id=target)<>1 then raise exception 'Duplicate follows'; end if;
  if exists(select 1 from public.user_notifications where actor_id=auth.uid() and recipient_id=target) then raise exception 'Sender can see recipient notification'; end if;
  blocked:=false;
  begin perform public.set_user_follow(auth.uid(),true); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Self follow accepted'; end if;
  blocked:=false;
  begin insert into public.user_follows(follower_id,followed_id) values(target,auth.uid()); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Forged follower accepted'; end if;
  blocked:=false;
  begin insert into public.user_notifications(recipient_id,actor_id) values(auth.uid(),target); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Forged notification accepted'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated','is_anonymous',true)::text,true);
  blocked:=false;
  begin perform public.set_user_follow(target,false); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Anonymous follow mutation accepted'; end if;
end;
$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.followed'),'role','authenticated','is_anonymous',false)::text,true);
do $$
declare notice uuid; blocked boolean;
begin
  select id into notice from public.user_notifications where actor_id=current_setting('test.follower')::uuid and recipient_id=auth.uid();
  if notice is null then raise exception 'Recipient did not receive notification'; end if;
  if (select count(*) from public.user_notifications where actor_id=current_setting('test.follower')::uuid and recipient_id=auth.uid())<>1 then raise exception 'Duplicate notifications'; end if;
  delete from public.user_follows where follower_id=current_setting('test.follower')::uuid and followed_id=auth.uid();
  if not exists(select 1 from public.user_follows where follower_id=current_setting('test.follower')::uuid and followed_id=auth.uid()) then raise exception 'Recipient removed another user follow'; end if;
  update public.user_notifications set read_at=now() where id=notice;
  if (select read_at from public.user_notifications where id=notice) is null then raise exception 'Read receipt failed'; end if;
  blocked:=false;
  begin update public.user_notifications set actor_id=auth.uid() where id=notice; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Actor could be changed'; end if;
end;
$$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.follower'),'role','authenticated','is_anonymous',false)::text,true);
do $$
declare result jsonb; affected int;
begin
  update public.user_notifications set read_at=null where recipient_id=current_setting('test.followed')::uuid;
  get diagnostics affected=row_count;
  if affected<>0 then raise exception 'Another user changed recipient read receipt'; end if;
  result:=public.set_user_follow(current_setting('test.followed')::uuid,false);
  if result->>'following'<>'false' or exists(select 1 from public.user_follows where follower_id=auth.uid() and followed_id=current_setting('test.followed')::uuid) then raise exception 'Unfollow failed'; end if;
  perform public.set_user_follow(current_setting('test.followed')::uuid,true);
end;
$$;
reset role;
do $$ begin
  if (select count(*) from public.user_notifications where actor_id=current_setting('test.follower')::uuid and recipient_id=current_setting('test.followed')::uuid)<>1 then raise exception 'Refollow created spam notifications'; end if;
end; $$;
set local role anon;
do $$ declare blocked boolean:=false; begin
  begin perform public.set_user_follow(current_setting('test.followed')::uuid,true); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Signed-out follow accepted'; end if;
end; $$;
reset role;
select 'Follow/unfollow, recipient notification, deduplication, read receipts, ownership, anonymous and signed-out protection passed.' as result;
