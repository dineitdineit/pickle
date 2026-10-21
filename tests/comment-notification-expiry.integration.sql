-- Small, independent expiry test; BEGIN/ROLLBACK only, no real customer identities.
select set_config('request.jwt.claims','{}',true);
create temporary table comment_expiry_fixture(label text primary key,id uuid default gen_random_uuid()) on commit drop;
insert into comment_expiry_fixture(label) values('owner'),('actor'),('recipe'),('expired'),('retained');
insert into auth.users(id,email,raw_user_meta_data) select id,'fixture-'||id||'@example.invalid',jsonb_build_object('username','fixture_'||replace(id::text,'-','')) from comment_expiry_fixture where label in('owner','actor');
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id) select 'Fixture recipe summary',r.id,'Synthetic alert expiry','Easy',10,o.id from comment_expiry_fixture r,comment_expiry_fixture o where r.label='recipe' and o.label='owner';
insert into public.recipe_comments(id,recipe_id,user_id,content) select c.id,r.id,a.id,'Synthetic expiry comment' from comment_expiry_fixture c,comment_expiry_fixture r,comment_expiry_fixture a where c.label in('expired','retained') and r.label='recipe' and a.label='actor';
insert into public.user_notifications(recipient_id,actor_id,recipe_id,comment_id,kind,created_at)
select o.id,a.id,r.id,c.id,'recipe_comment',now()-case when c.label='expired' then interval '31 days' else interval '29 days' end
from comment_expiry_fixture o,comment_expiry_fixture a,comment_expiry_fixture r,comment_expiry_fixture c where o.label='owner' and a.label='actor' and r.label='recipe' and c.label in('expired','retained');
do $$ declare result jsonb; begin
 result:=retention_helpers.purge_records();
 if result->>'busy'='true' then raise exception 'Scheduled purge is busy; retry this rollback test later'; end if;
 if exists(select 1 from public.user_notifications where comment_id=(select id from comment_expiry_fixture where label='expired')) then raise exception 'Expired comment alert retained'; end if;
 if not exists(select 1 from public.user_notifications where comment_id=(select id from comment_expiry_fixture where label='retained')) then raise exception 'Unexpired comment alert purged'; end if;
end; $$;
select 'Thirty-day comment notification expiry passed' as result;
