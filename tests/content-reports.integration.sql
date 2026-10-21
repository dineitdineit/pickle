-- Execute wrapped in BEGIN / ROLLBACK. Never retain fixtures or role changes.
select set_config('test.owner',(select id::text from public.profiles order by id limit 1),true);
select set_config('test.reporter',(select id::text from public.profiles order by id offset 1 limit 1),true);
select set_config('test.recipe',gen_random_uuid()::text,true);
select set_config('test.review',gen_random_uuid()::text,true);
select set_config('test.comment',gen_random_uuid()::text,true);
select set_config('test.dismiss_comment',gen_random_uuid()::text,true);
select set_config('test.remove_comment',gen_random_uuid()::text,true);
select set_config('test.owner_role',(select role from public.profiles where id=current_setting('test.owner')::uuid),true);
update public.profiles set role='user' where id=current_setting('test.reporter')::uuid;
insert into public.recipes(short_description,id,title,difficulty,total_time_minutes,author_id)
values('Fixture recipe summary',current_setting('test.recipe')::uuid,'Moderation rollback fixture','Easy',10,current_setting('test.owner')::uuid);
insert into public.recipe_reviews(id,recipe_id,user_id,rating,content)
values(current_setting('test.review')::uuid,current_setting('test.recipe')::uuid,current_setting('test.owner')::uuid,5,'Review snapshot fixture');
insert into public.recipe_comments(id,recipe_id,user_id,content)
values(current_setting('test.comment')::uuid,current_setting('test.recipe')::uuid,current_setting('test.owner')::uuid,'Comment snapshot fixture');
insert into public.recipe_comments(id,recipe_id,user_id,content) values
(current_setting('test.dismiss_comment')::uuid,current_setting('test.recipe')::uuid,current_setting('test.owner')::uuid,'Comment dismissal fixture'),
(current_setting('test.remove_comment')::uuid,current_setting('test.recipe')::uuid,current_setting('test.owner')::uuid,'Comment removal fixture');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare first jsonb; duplicate jsonb; blocked boolean; begin
  first:=public.submit_content_report('recipe',current_setting('test.recipe')::uuid,'spam','Report detail');
  duplicate:=public.submit_content_report('recipe',current_setting('test.recipe')::uuid,'spam','Repeated detail');
  if first->>'id'<>duplicate->>'id' then raise exception 'Duplicate open report accepted'; end if;
  perform set_config('test.recipe_report',first->>'id',true);
  first:=public.submit_content_report('review',current_setting('test.review')::uuid,'harassment',null);
  perform set_config('test.review_report',first->>'id',true);
  first:=public.submit_content_report('user',current_setting('test.owner')::uuid,'other','User report');
  perform set_config('test.user_report',first->>'id',true);
  perform set_config('test.comment_report',public.submit_comment_report(current_setting('test.comment')::uuid,'spam','Comment report')::text,true);
  perform set_config('test.dismiss_comment_report',public.submit_comment_report(current_setting('test.dismiss_comment')::uuid,'other',null)::text,true);
  perform set_config('test.remove_comment_report',public.submit_comment_report(current_setting('test.remove_comment')::uuid,'harassment',null)::text,true);
  if exists(select 1 from public.content_reports) then raise exception 'Non-admin read reports'; end if;
  blocked:=false;
  begin perform public.admin_content_reports(); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Non-admin loaded admin queue'; end if;
  blocked:=false;
  begin perform public.moderate_content_report(current_setting('test.recipe_report')::uuid,'hide',null); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Non-admin moderated'; end if;
  blocked:=false;
  begin perform public.moderate_comment_report(current_setting('test.comment_report')::uuid,'hide',null); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Non-admin moderated comment'; end if;
  blocked:=false;
  begin update public.content_reports set status='actioned'; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Direct report write allowed'; end if;
  blocked:=false;
  begin update public.recipe_reviews set moderation_status='hidden' where id=current_setting('test.review')::uuid; exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Client forged review moderation'; end if;
  blocked:=false;
  begin perform public.submit_content_report('user',auth.uid(),'spam',null); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'Self report accepted'; end if;
  blocked:=false;
  begin perform public.submit_content_report('recipe',current_setting('test.recipe')::uuid,'invalid',null); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'Invalid reason accepted'; end if;
  blocked:=false;
  begin perform public.submit_content_report('recipe',current_setting('test.recipe')::uuid,'spam',repeat('x',501)); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'Oversized details accepted'; end if;
end; $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',true)::text,true);
do $$ declare blocked boolean:=false; begin
  begin perform public.submit_content_report('user',current_setting('test.owner')::uuid,'spam',null); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Anonymous sign-in reported user'; end if;
  blocked:=false;
  begin perform public.submit_comment_report(current_setting('test.comment')::uuid,'spam',null); exception when others then blocked:=true; end;
  if not blocked then raise exception 'Anonymous sign-in reported comment'; end if;
end; $$;
reset role;
update public.profiles set role='admin' where id=current_setting('test.reporter')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.reporter'),'role','authenticated','is_anonymous',false)::text,true);
set local role authenticated;
do $$ declare queue jsonb; result jsonb; blocked boolean; begin
  queue:=public.admin_content_reports('all','open',0);
  if not exists(select 1 from jsonb_array_elements(queue->'reports') r where r->>'id'=current_setting('test.recipe_report')) then raise exception 'Queue omitted new report'; end if;
  if not exists(select 1 from public.content_reports where id=current_setting('test.recipe_report')::uuid and snapshot->>'title'='Moderation rollback fixture' and details='Report detail') then raise exception 'Recipe snapshot/details missing'; end if;
  if not exists(select 1 from public.content_reports where id=current_setting('test.review_report')::uuid and snapshot->>'content'='Review snapshot fixture' and snapshot->>'rating'='5') then raise exception 'Review snapshot/rating missing'; end if;
  -- Moderation must still work when the administrator personally blocks the author.
  perform public.set_user_block(current_setting('test.owner')::uuid,true);
  result:=public.moderate_content_report(current_setting('test.recipe_report')::uuid,'hide','Recipe admin memo');
  if result->>'target_state'<>'hidden' then raise exception 'Recipe hide not confirmed'; end if;
  if not exists(select 1 from public.content_reports where id=current_setting('test.recipe_report')::uuid and status='actioned' and resolution_note='Recipe admin memo' and reviewed_by=auth.uid()) then raise exception 'Recipe memo or review status missing'; end if;
  perform public.moderate_content_report(current_setting('test.review_report')::uuid,'hide','Review admin memo');
  if (select rating_count from public.recipe_rating_summary(current_setting('test.recipe')::uuid))<>0 then raise exception 'Hidden review remained in admin rating summary'; end if;
  perform public.moderate_content_report(current_setting('test.user_report')::uuid,'resolve','User reviewed without restriction');
  if not exists(select 1 from public.content_reports where id=current_setting('test.user_report')::uuid and status='actioned' and resolution_note='User reviewed without restriction') then raise exception 'User resolve missing'; end if;
  blocked:=false;
  begin perform public.moderate_content_report(current_setting('test.user_report')::uuid,'hide',null); exception when invalid_parameter_value then blocked:=true; end;
  if not blocked then raise exception 'User restriction accepted'; end if;
  perform public.moderate_comment_report(current_setting('test.comment_report')::uuid,'hide','Comment admin memo');
  if not exists(select 1 from public.comment_reports where id=current_setting('test.comment_report')::uuid and status='actioned' and resolution_note='Comment admin memo') then raise exception 'Comment review state missing'; end if;
  if not exists(select 1 from public.moderation_actions where report_id=current_setting('test.comment_report')::uuid and action='hide' and note='Comment admin memo') then raise exception 'Comment audit missing'; end if;
  perform public.moderate_comment_report(current_setting('test.dismiss_comment_report')::uuid,'dismiss','Comment dismissal memo');
  perform public.moderate_comment_report(current_setting('test.remove_comment_report')::uuid,'remove','Comment removal memo');
  if not exists(select 1 from public.comment_reports where id=current_setting('test.dismiss_comment_report')::uuid and status='dismissed' and resolution_note='Comment dismissal memo') then raise exception 'Comment dismissal missing'; end if;
  if not exists(select 1 from public.comment_reports where id=current_setting('test.remove_comment_report')::uuid and status='actioned' and resolution_note='Comment removal memo') then raise exception 'Comment removal state missing'; end if;
  if (select count(*) from public.moderation_actions where report_id in (current_setting('test.dismiss_comment_report')::uuid,current_setting('test.remove_comment_report')::uuid) and admin_id=auth.uid())<>2 then raise exception 'Comment dismissal/removal audit missing'; end if;
  blocked:=false;
  begin perform public.moderate_comment_report(current_setting('test.comment_report')::uuid,'hide',null); exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'Stale comment moderation accepted'; end if;
end; $$;
reset role;
-- Verify stored state as the fixture owner: a personal block now hides these
-- rows from even an admin's ordinary content queries, but never from moderation.
do $$ begin
 if not exists(select 1 from public.recipe_comments where id=current_setting('test.comment')::uuid and moderation_status='hidden') then raise exception 'Comment hide failed'; end if;
 if not exists(select 1 from public.recipe_comments where id=current_setting('test.dismiss_comment')::uuid and moderation_status='active') then raise exception 'Dismiss hid comment'; end if;
 if not exists(select 1 from public.recipe_comments where id=current_setting('test.remove_comment')::uuid and moderation_status='removed') then raise exception 'Comment removal failed'; end if;
end; $$;
set local role authenticated;
select public.set_user_block(current_setting('test.owner')::uuid,false);
reset role;
set local role anon;
do $$ declare blocked boolean:=false; begin
  if exists(select 1 from public.recipes where id=current_setting('test.recipe')::uuid) then raise exception 'Anon sees hidden recipe'; end if;
  if exists(select 1 from public.recipe_reviews where id=current_setting('test.review')::uuid) then raise exception 'Anon sees hidden review'; end if;
  if exists(select 1 from public.recipe_comments where id=current_setting('test.comment')::uuid) then raise exception 'Anon sees hidden comment'; end if;
  if exists(select 1 from public.recipe_comments where id=current_setting('test.remove_comment')::uuid) then raise exception 'Anon sees removed comment'; end if;
  if not exists(select 1 from public.recipe_comments where id=current_setting('test.dismiss_comment')::uuid) then raise exception 'Anon cannot see dismissed comment'; end if;
  begin perform public.submit_content_report('user',current_setting('test.owner')::uuid,'spam',null); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'Signed-out report accepted'; end if;
end; $$;
reset role;
set local role authenticated;
do $$ declare r jsonb; begin
  perform public.moderate_content_report(current_setting('test.recipe_report')::uuid,'restore','Restored recipe');
  perform public.moderate_content_report(current_setting('test.review_report')::uuid,'restore','Restored review');
  if (select rating_count from public.recipe_rating_summary(current_setting('test.recipe')::uuid))<>1 then raise exception 'Review rating not restored'; end if;
  r:=public.submit_content_report('user',current_setting('test.owner')::uuid,'other',null);
  perform public.moderate_content_report((r->>'id')::uuid,'dismiss','Dismissed user report');
  if not exists(select 1 from public.content_reports where id=(r->>'id')::uuid and status='dismissed') then raise exception 'User dismissal missing'; end if;
  if (select count(*) from public.content_moderation_actions where target_id in (current_setting('test.recipe')::uuid,current_setting('test.review')::uuid,current_setting('test.owner')::uuid) and admin_id=auth.uid() and created_at>=transaction_timestamp())<6 then raise exception 'Action history incomplete'; end if;
end; $$;
reset role;
do $$ begin
  if not exists(select 1 from public.recipes where id=current_setting('test.recipe')::uuid and not is_hidden) then raise exception 'Recipe restoration failed'; end if;
  if not exists(select 1 from public.profiles where id=current_setting('test.owner')::uuid and role=current_setting('test.owner_role')) then raise exception 'User account role changed'; end if;
end; $$;
select 'Report submission, deduplication, role restrictions, queue, hide/restore, rating exclusion, user resolve/dismiss, admin notes and comment hide/remove/dismiss/audit/stale guards passed' as result;
