-- Synthetic data only. Execute inside BEGIN/ROLLBACK.
create temporary table notification_fixture(label text primary key,id uuid default gen_random_uuid()) on commit drop;
insert into notification_fixture(label) values('owner'),('actor'),('other'),('recipe'),('comment'),('reply'),('muted_follow'),('muted_recipe'),('muted_comment'),('muted_reply'),('default_follow'),('moderation'),('seen'),('unseen'),('paused');
grant select on notification_fixture to authenticated;
insert into auth.users(id,email,created_at,raw_user_meta_data) select id,'fixture-'||id||'@example.invalid',now(),jsonb_build_object('username','fixture_'||replace(id::text,'-','')) from notification_fixture where label in('owner','actor','other');
insert into public.account_age_confirmations(user_id,minimum_age,rule_version) select id,18,'18-plus-v1' from notification_fixture where label in('owner','actor','other');
insert into public.recipes(short_description,id,title,author_id,difficulty,total_time_minutes) select 'Fixture recipe summary',r.id,'Notification settings fixture',u.id,'Easy',10 from notification_fixture r,notification_fixture u where r.label='recipe' and u.label='owner';
insert into public.recipe_comments(id,recipe_id,user_id,content) select c.id,r.id,u.id,'Fixture comment' from notification_fixture c,notification_fixture r,notification_fixture u where c.label='comment' and r.label='recipe' and u.label='actor';
insert into public.recipe_comments(id,recipe_id,user_id,content,parent_comment_id) select c.id,r.id,u.id,'Fixture reply',p.id from notification_fixture c,notification_fixture r,notification_fixture u,notification_fixture p where c.label='reply' and r.label='recipe' and u.label='other' and p.label='comment';
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from notification_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
insert into public.notification_preferences(user_id,enabled,follows,recipes,comments,replies) values(auth.uid(),true,false,false,false,false);
do $$ begin if not exists(select 1 from public.notification_preferences where user_id=auth.uid() and enabled and not follows and not recipes and not comments and not replies) then raise exception 'Own settings save failed'; end if; end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
insert into public.user_notifications(id,recipient_id,actor_id,kind)
select n.id,o.id,a.id,'follow' from notification_fixture n,notification_fixture o,notification_fixture a where n.label='muted_follow' and o.label='owner' and a.label='actor';
insert into public.user_notifications(id,recipient_id,actor_id,kind,recipe_id)
select n.id,o.id,a.id,'new_recipe',r.id from notification_fixture n,notification_fixture o,notification_fixture a,notification_fixture r where n.label='muted_recipe' and o.label='owner' and a.label='actor' and r.label='recipe';
insert into public.user_notifications(id,recipient_id,actor_id,kind,recipe_id,comment_id)
select n.id,o.id,a.id,'recipe_comment',r.id,c.id from notification_fixture n,notification_fixture o,notification_fixture a,notification_fixture r,notification_fixture c where n.label='muted_comment' and o.label='owner' and a.label='actor' and r.label='recipe' and c.label='comment';
insert into public.user_notifications(id,recipient_id,actor_id,kind,recipe_id,comment_id)
select n.id,o.id,a.id,'comment_reply',r.id,c.id from notification_fixture n,notification_fixture o,notification_fixture a,notification_fixture r,notification_fixture c where n.label='muted_reply' and o.label='owner' and a.label='other' and r.label='recipe' and c.label='reply';
insert into public.user_notifications(id,recipient_id,actor_id,kind)
select n.id,o.id,a.id,'follow' from notification_fixture n,notification_fixture o,notification_fixture a where n.label='default_follow' and o.label='actor' and a.label='other';
-- Pausing all activity never suppresses moderation notices.
update public.notification_preferences set enabled=false,follows=true where user_id=(select id from notification_fixture where label='owner');
insert into public.user_notifications(id,recipient_id,actor_id,kind)
select n.id,o.id,a.id,'follow' from notification_fixture n,notification_fixture o,notification_fixture a where n.label='paused' and o.label='owner' and a.label='actor';
insert into public.user_notifications(id,recipient_id,kind,moderation_event_id,moderation_details)
select n.id,o.id,'moderation',gen_random_uuid(),'{"type":"account","action":"warning","reason":"Fixture","message":"Fixture"}'::jsonb from notification_fixture n,notification_fixture o where n.label='moderation' and o.label='owner';
do $$ begin
 if exists(select 1 from public.user_notifications where id in(select id from notification_fixture where label like 'muted_%' or label='paused')) then raise exception 'Muted notification generated'; end if;
 if (select count(*) from public.user_notifications where id in(select id from notification_fixture where label in('default_follow','moderation')))<>2 then raise exception 'Defaults or essential notice suppressed'; end if;
end; $$;
-- Enable selected categories again. Preserve old inbox contents.
update public.notification_preferences set enabled=true,follows=true,recipes=true where user_id=(select id from notification_fixture where label='owner');
insert into public.user_notifications(id,recipient_id,actor_id,kind)
select n.id,o.id,a.id,'follow' from notification_fixture n,notification_fixture o,notification_fixture a where n.label='seen' and o.label='owner' and a.label='actor';
insert into public.user_notifications(id,recipient_id,actor_id,kind,recipe_id)
select n.id,o.id,a.id,'new_recipe',r.id from notification_fixture n,notification_fixture o,notification_fixture a,notification_fixture r where n.label='unseen' and o.label='owner' and a.label='actor' and r.label='recipe';
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from notification_fixture where label='owner'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
update public.user_notifications set read_at=now() where recipient_id=auth.uid() and id=(select id from notification_fixture where label='seen') and read_at is null;
do $$ begin
 if (select read_at from public.user_notifications where id=(select id from notification_fixture where label='seen')) is null then raise exception 'Seen row not read'; end if;
 if (select read_at from public.user_notifications where id=(select id from notification_fixture where label='unseen')) is not null then raise exception 'Unseen row marked read'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from notification_fixture where label='actor'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare affected integer; denied boolean:=false; begin
 if exists(select 1 from public.notification_preferences) then raise exception 'Another account settings exposed'; end if;
 update public.notification_preferences set enabled=false where user_id=(select id from notification_fixture where label='owner');
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Another account settings modified'; end if;
 begin insert into public.notification_preferences(user_id) select id from notification_fixture where label='owner'; exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Forged settings insert'; end if;
 update public.user_notifications set read_at=now() where recipient_id=(select id from notification_fixture where label='owner');
 get diagnostics affected=row_count;
 if affected<>0 then raise exception 'Another inbox marked read'; end if;
end; $$;
reset role;
select set_config('request.jwt.claims','{}',true);
delete from auth.users where id=(select id from notification_fixture where label='owner');
do $$ begin if exists(select 1 from public.notification_preferences where user_id=(select id from notification_fixture where label='owner')) then raise exception 'Preferences not deleted with account'; end if; end; $$;
select 'Notification preferences: defaults, category delivery, pause, essential notices, recipient read scope, cross-account protection and account deletion passed' as result;
