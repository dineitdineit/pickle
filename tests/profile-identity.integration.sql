-- Run inside BEGIN / ROLLBACK; no account is renamed by this test.
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where nullif(btrim(username),'') is not null and nullif(btrim(display_name),'') is not null order by id limit 1),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$
declare blocked boolean; affected integer;
begin
  if auth.uid() is null then raise exception 'Test needs a named profile'; end if;
  blocked:=false;
  begin update public.profiles set username=username||'_changed' where id=auth.uid(); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Username change accepted'; end if;
  blocked:=false;
  begin update public.profiles set display_name=display_name||' changed' where id=auth.uid(); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Display name change accepted'; end if;
  blocked:=false;
  begin update public.profiles set username=null where id=auth.uid(); exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'Username could be cleared'; end if;
  update public.profiles set avatar_url=avatar_url,username=username,display_name=display_name where id=auth.uid();
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Avatar or unchanged-name update blocked'; end if;
end; $$;
reset role;
select 'Username/display name changes and clearing are blocked; avatar and unchanged-name updates remain allowed.' as result;
