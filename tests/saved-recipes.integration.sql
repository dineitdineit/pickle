-- Private saved collection fixtures only. No dispatchers, messages or uploads.
begin;
create temp table f as select gen_random_uuid() u,gen_random_uuid() v;
grant select on f to authenticated,anon;
insert into auth.users(id,email,raw_user_meta_data) select i,i||'@example.invalid',jsonb_build_object('username','saved_'||replace(i::text,'-','')) from f,lateral(values(u),(v))a(i);
do $$declare i uuid;begin for i in select u from f union all select v from f loop
 perform set_config('request.jwt.claims',jsonb_build_object('sub',i,'role','authenticated','is_anonymous',false)::text,true);
 perform public.confirm_account_age_v2('1990-01-01');
 perform public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
end loop;end$$;
create temp table items as select n,gen_random_uuid() id from generate_series(1,61) n;
grant select on items to authenticated,anon;
insert into public.recipes(id,title,short_description,difficulty,total_time_minutes,author_id)
 select id,case when n=58 then 'Saved literal % recipe' else 'Saved fixture '||lpad(n::text,3,'0') end,
 case when n=60 then 'ginger sesame beyond first page' else 'Private saved fixture summary' end,'Easy',10,v from items,f;
insert into public.saved_recipes(user_id,recipe_id,created_at) select u,id,now()-make_interval(secs=>case when n<=3 then 1 else n end) from f,items where n<=60;
insert into public.saved_recipes(user_id,recipe_id,cook_state) select v,id,'cooked' from f,items where n=1;
select set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true) from f;
set local role authenticated;
do $$declare row record; anchor timestamptz; anchor_id uuid; seen uuid[]:='{}'; page_count integer; amount integer;begin
 if (select count(*) from public.search_saved_recipes())<>25 then raise exception 'First page is not bounded with lookahead'; end if;
 loop
  page_count:=0;
  for row in select * from public.search_saved_recipes('', 'all',anchor,anchor_id,24) limit 24 loop
   if row.id=any(seen) then raise exception 'Pagination repeated a recipe'; end if;
   seen:=array_append(seen,row.id); anchor:=row.saved_at; anchor_id:=row.id; page_count:=page_count+1;
  end loop;
  exit when page_count<24;
 end loop;
 if cardinality(seen)<>60 then raise exception 'Pagination lost saves with tied timestamps'; end if;
 if (select count(*) from public.search_saved_recipes('GINGER SESAME'))<>1 then raise exception 'Saved-only description search missed older recipe'; end if;
 if exists(select 1 from public.search_saved_recipes('061')) then raise exception 'Unsaved recipe leaked into search'; end if;
 if (select count(*) from public.search_saved_recipes('%'))<>1 then raise exception 'Query wildcard was not treated literally'; end if;
 if exists(select 1 from public.saved_recipes where cook_state<>'want_to_cook') then raise exception 'Default/owner isolation failed'; end if;
 update public.saved_recipes set cook_state='cooked' where user_id=(select u from f) and recipe_id=(select id from items where n=60);
 if (select count(*) from public.search_saved_recipes('','cooked'))<>1 then raise exception 'Cooked filter incorrect'; end if;
 if exists(select 1 from public.search_saved_recipes('ginger','want_to_cook')) then raise exception 'State and search did not combine'; end if;
 update public.saved_recipes set cook_state='want_to_cook' where user_id=(select v from f);
 get diagnostics amount=row_count;
 if amount<>0 then raise exception 'Changed another account'; end if;
 begin update public.saved_recipes set recipe_id=gen_random_uuid() where user_id=(select u from f); raise exception 'Save identity writable'; exception when insufficient_privilege then null; end;
 begin truncate public.saved_recipes; raise exception 'Authenticated TRUNCATE permitted'; exception when insufficient_privilege then null; end;
 begin update public.saved_recipes set cook_state='unknown' where user_id=(select u from f); raise exception 'Unknown state accepted'; exception when check_violation then null; end;
 begin perform public.search_saved_recipes('','unknown'); raise exception 'Invalid filter accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.search_saved_recipes('','all',now(),null); raise exception 'Partial cursor accepted'; exception when invalid_parameter_value then null; end;
end$$;
reset role;
update public.recipes set is_hidden=true where id=(select id from items where n=59);
set local role authenticated;
do $$declare amount integer;begin
 if exists(select 1 from public.search_saved_recipes('059')) then raise exception 'Hidden recipe leaked'; end if;
 update public.saved_recipes set cook_state='cooked' where user_id=(select u from f) and recipe_id=(select id from items where n=59);
 get diagnostics amount=row_count;
 if amount<>0 then raise exception 'Hidden save could be modified'; end if;
end$$;
reset role;
insert into public.user_blocks(blocker_id,blocked_id) select u,v from f;
set local role authenticated;
do $$begin if exists(select 1 from public.search_saved_recipes()) then raise exception 'Blocked author leaked in saved results'; end if;end$$;
reset role;
delete from public.user_blocks where blocker_id=(select u from f) and blocked_id=(select v from f);
set local role authenticated;
do $$begin
 if not exists(select 1 from public.search_saved_recipes('ginger','cooked')) then raise exception 'Unblock lost private cooking state'; end if;
 delete from public.saved_recipes where user_id=(select u from f) and recipe_id=(select id from items where n=60);
 insert into public.saved_recipes(user_id,recipe_id) select u,id from f,items where n=60;
 if not exists(select 1 from public.search_saved_recipes('ginger','want_to_cook')) then raise exception 'New save did not default to Want to cook'; end if;
end$$;
reset role;
set local role anon;
do $$begin begin perform public.search_saved_recipes(); raise exception 'Signed-out search allowed'; exception when insufficient_privilege then null; end;end$$;
reset role;
rollback;
