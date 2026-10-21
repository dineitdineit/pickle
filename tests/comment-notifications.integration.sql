-- Synthetic identities only; execute inside BEGIN/ROLLBACK, never keep fixtures.
create temporary table comment_notice_fixture(label text primary key,id uuid default gen_random_uuid()) on commit drop;
insert into comment_notice_fixture(label) values('owner'),('writer'),('replier'),('outsider'),('recipe'),('own_comment'),('comment'),('reply'),('reply_owner'),('owner_reply'),('self_reply');
insert into auth.users(id,email,raw_user_meta_data)
select id,'fixture-'||id||'@example.invalid',jsonb_build_object('username','fixture_'||replace(id::text,'-','')) from comment_notice_fixture where label in('owner','writer','replier','outsider');
grant select on comment_notice_fixture to authenticated;
insert into public.recipes(short_description,id,title,author_id,difficulty,total_time_minutes)
select 'Fixture recipe summary',r.id,'Synthetic comment notifications',o.id,'Easy',10 from comment_notice_fixture r,comment_notice_fixture o where r.label='recipe' and o.label='owner';

select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
insert into public.recipe_comments(id,recipe_id,user_id,content) select c.id,r.id,auth.uid(),'Own comment' from comment_notice_fixture c,comment_notice_fixture r where c.label='own_comment' and r.label='recipe';
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='writer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
insert into public.recipe_comments(id,recipe_id,user_id,content) select c.id,r.id,auth.uid(),'A new comment' from comment_notice_fixture c,comment_notice_fixture r where c.label='comment' and r.label='recipe';
update public.recipe_comments set content='Edited comment' where id=(select id from comment_notice_fixture where label='comment');
insert into public.recipe_comments(id,recipe_id,user_id,content,parent_comment_id) select c.id,r.id,auth.uid(),'Replying to myself',p.id from comment_notice_fixture c,comment_notice_fixture r,comment_notice_fixture p where c.label='self_reply' and r.label='recipe' and p.label='comment';
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='replier'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
select public.confirm_account_age('1990-01-01');
select public.accept_content_policy((select version from public.content_policy_versions where active),true,true);
insert into public.recipe_comments(id,recipe_id,user_id,content,parent_comment_id) select c.id,r.id,auth.uid(),'Replying to the writer',p.id from comment_notice_fixture c,comment_notice_fixture r,comment_notice_fixture p where c.label='reply' and r.label='recipe' and p.label='comment';
insert into public.recipe_comments(id,recipe_id,user_id,content,parent_comment_id) select c.id,r.id,auth.uid(),'Replying to the owner',p.id from comment_notice_fixture c,comment_notice_fixture r,comment_notice_fixture p where c.label='reply_owner' and r.label='recipe' and p.label='own_comment';
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
insert into public.recipe_comments(id,recipe_id,user_id,content,parent_comment_id) select c.id,r.id,auth.uid(),'Owner reply',p.id from comment_notice_fixture c,comment_notice_fixture r,comment_notice_fixture p where c.label='owner_reply' and r.label='recipe' and p.label='comment';
do $$ declare denied boolean:=false; begin
 if exists(select 1 from public.user_notifications where recipient_id<>auth.uid()) then raise exception 'Another inbox visible'; end if;
 if (select count(*) from public.user_notifications where kind in('recipe_comment','comment_reply'))<>4 then raise exception 'Owner comment/reply count wrong'; end if;
 if (select kind from public.user_notifications where comment_id=(select id from comment_notice_fixture where label='reply_owner'))<>'comment_reply' then raise exception 'Owner received duplicate/wrong reply'; end if;
 begin insert into public.user_notifications(recipient_id,actor_id,kind,recipe_id,comment_id) select auth.uid(),a.id,'recipe_comment',r.id,c.id from comment_notice_fixture a,comment_notice_fixture r,comment_notice_fixture c where a.label='replier' and r.label='recipe' and c.label='reply'; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Client forged a notification'; end if;
end; $$;
reset role;
do $$ begin
 if (select count(*) from public.user_notifications where recipe_id=(select id from comment_notice_fixture where label='recipe'))<>6 then raise exception 'Duplicate edit/self/recipient alert'; end if;
 if exists(select 1 from public.user_notifications where recipient_id=actor_id) then raise exception 'Self alert created'; end if;
end; $$;

-- Parent moderation hides dependent reply alerts, including the badge count.
select set_config('request.jwt.claims','{}',true);
update public.recipe_comments set moderation_status='hidden' where id=(select id from comment_notice_fixture where label='comment');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='writer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.user_notifications where kind='comment_reply') then raise exception 'Hidden parent leaked through reply notice'; end if; end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update public.recipe_comments set moderation_status='active' where id=(select id from comment_notice_fixture where label='comment');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='writer'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin
 if (select count(*) from public.user_notifications where kind='comment_reply')<>2 then raise exception 'Reply recipient count wrong'; end if;
end; $$;
update public.user_notifications set read_at=now() where comment_id=(select id from comment_notice_fixture where label='reply');
do $$ begin if (select count(*) from public.user_notifications where kind='comment_reply' and read_at is null)<>1 then raise exception 'Unread count wrong'; end if; end; $$;
select public.set_user_block((select id from comment_notice_fixture where label='replier'),true);
do $$ begin if exists(select 1 from public.user_notifications where actor_id=(select id from comment_notice_fixture where label='replier')) then raise exception 'Blocked actor alert visible'; end if; end; $$;
reset role;

select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='outsider'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.user_notifications) then raise exception 'Unrelated user read another inbox'; end if; end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
delete from public.recipe_comments where id=(select id from comment_notice_fixture where label='reply_owner');
do $$ begin if exists(select 1 from public.user_notifications where comment_id=(select id from comment_notice_fixture where label='reply_owner')) then raise exception 'Deleted comment retained alert'; end if; end; $$;
update public.recipes set is_hidden=true where id=(select id from comment_notice_fixture where label='recipe');
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from comment_notice_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ begin if exists(select 1 from public.user_notifications where kind in('recipe_comment','comment_reply')) then raise exception 'Hidden recipe alerts visible'; end if; end; $$;
reset role;
select 'Comment/reply recipients, self/edit deduplication, ownership, unread state, moderation, blocks and deletion passed' as result;
