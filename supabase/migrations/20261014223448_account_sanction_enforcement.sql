create function operations_helpers.can_act(p_action text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and not exists(select 1 from public.account_sanctions s where s.user_id=auth.uid() and s.revoked_at is null and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and (
 (s.kind='report_limit_7' and p_action='report') or
 (s.kind='restrict_3' and p_action in('publish','message','content_upload')) or
 (s.kind in('suspend_7','suspend_30','permanent','temp_suspend') and p_action in('publish','message','social','profile','content_upload','draft'))
 ));
$$;
revoke all on function operations_helpers.can_act(text) from public,anon,authenticated;
grant execute on function operations_helpers.can_act(text) to authenticated;
create function operations_helpers.guard_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare action text; uid uuid:=auth.uid();
begin
 if uid is null then return new; end if;
 if tg_table_name in('content_reports','comment_reports') then action:='report';
 elsif tg_table_name='direct_messages' then action:='message';
 elsif tg_table_name='recipes' then
  if tg_op='UPDATE' then
   if new.title is not distinct from old.title and new.description is not distinct from old.description and new.short_description is not distinct from old.short_description and new.cover_image is not distinct from old.cover_image then return new; end if;
  end if;
  action:='publish';
 elsif tg_table_name='recipe_submissions' then action:=case when new.status='published' then 'publish' else 'draft' end;
 elsif tg_table_name in('recipe_comments','recipe_reviews') then
  if tg_op='UPDATE' then
   if new.content is not distinct from old.content then
    if tg_table_name='recipe_comments' then return new; end if;
    if new.rating is not distinct from old.rating then return new; end if;
   end if;
  end if;
  action:='publish';
 elsif tg_table_name='profiles' then
  if new.id<>uid and private.is_admin() then return new; end if;
  action:='profile';
 else action:='social'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||uid::text,0));
 if not operations_helpers.can_act(action) then raise exception 'Your account is restricted. Open Account status to review the reason, duration and appeal options.' using errcode='42501'; end if;
 if tg_table_name='direct_messages' then
  if exists(select 1 from public.account_sanctions where user_id=new.recipient_id and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now()) and kind in('suspend_7','suspend_30','permanent','temp_suspend')) then raise exception 'Contact unavailable' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
revoke all on function operations_helpers.guard_write() from public,anon,authenticated;
create trigger account_guard_comments before insert or update on public.recipe_comments for each row execute function operations_helpers.guard_write();
create trigger account_guard_reviews before insert or update on public.recipe_reviews for each row execute function operations_helpers.guard_write();
create trigger account_guard_recipes before insert or update on public.recipes for each row execute function operations_helpers.guard_write();
create trigger account_guard_submissions before insert or update on public.recipe_submissions for each row execute function operations_helpers.guard_write();
create trigger account_guard_messages before insert on public.direct_messages for each row execute function operations_helpers.guard_write();
create trigger account_guard_follows before insert or update on public.user_follows for each row execute function operations_helpers.guard_write();
create trigger account_guard_likes before insert on public.recipe_likes for each row execute function operations_helpers.guard_write();
create trigger account_guard_saves before insert on public.saved_recipes for each row execute function operations_helpers.guard_write();
create trigger account_guard_comment_likes before insert on public.comment_likes for each row execute function operations_helpers.guard_write();
create trigger account_guard_profile before update on public.profiles for each row execute function operations_helpers.guard_write();
create trigger account_guard_reports before insert on public.content_reports for each row execute function operations_helpers.guard_write();
create trigger account_guard_comment_reports before insert on public.comment_reports for each row execute function operations_helpers.guard_write();
create policy account_guard_storage_insert on storage.objects as restrictive for insert to authenticated
with check((select operations_helpers.can_act('content_upload')));
create policy account_guard_storage_update on storage.objects as restrictive for update to authenticated
using((select operations_helpers.can_act('content_upload'))) with check((select operations_helpers.can_act('content_upload')));

create function operations_helpers.notice(p_event uuid,p_user uuid,p_type text,p_action text,p_reason text,p_message text,p_case uuid,p_email boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform operations_helpers.require_admin();
 if p_user is null or not exists(select 1 from public.profiles where id=p_user) then return; end if;
 insert into public.user_notifications(recipient_id,actor_id,kind,moderation_event_id,moderation_details)
 values(p_user,null,'moderation',p_event,jsonb_build_object('type',p_type,'action',p_action,'reason',p_reason,'message',p_message,'case_id',p_case))
 on conflict do nothing;
 if p_email then
 insert into moderation_helpers.email_outbox(id,recipient_id,subject,body)
 values(p_event,p_user,'Pickle: Account and content review update',p_message||E'\n\nReason: '||p_reason||E'\n\nOpen Profile > Account status in Pickle for details and appeal options. Appeals may be submitted within 14 days of the notice.\nContact: admin@getpickleapp.com\n\nThe Pickle team') on conflict do nothing;
 end if;
end; $$;
revoke all on function operations_helpers.notice(uuid,uuid,text,text,text,text,uuid,boolean) from public,anon,authenticated;

create function operations_helpers.my_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 return jsonb_build_object('user_id',uid,
 'can_publish',operations_helpers.can_act('publish'),'can_message',operations_helpers.can_act('message'),'can_social',operations_helpers.can_act('social'),'can_report',operations_helpers.can_act('report'),
 'restrictions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'starts_at',starts_at,'ends_at',ends_at) order by starts_at desc),'[]') from public.account_sanctions where user_id=uid and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now())),
 'decisions',(select coalesce(jsonb_agg(row order by notified_at desc,id),'[]') from (
 select d.id,d.case_id,d.outcome,d.clause,d.public_reason,d.sanction,d.state,d.notified_at,
 c.target_type,c.target_id,
 (select jsonb_build_object('id',a.id,'status',a.status,'explanation',a.explanation,'response',a.response,'created_at',a.created_at,'reviewed_at',a.reviewed_at) from public.moderation_appeals a where a.decision_id=d.id) as appeal,
 (d.state in('confirmed','temporary') and d.notified_at is not null and now()<=d.notified_at+interval '14 days' and not exists(select 1 from public.moderation_appeals a where a.decision_id=d.id)) as can_appeal
 from public.moderation_decisions d join public.moderation_cases c on c.id=d.case_id where d.subject_id=uid and d.notified_at is not null and d.state<>'proposed' order by d.notified_at desc,d.id limit 100
 ) row));
end; $$;
revoke all on function operations_helpers.my_status() from public,anon,authenticated;
grant execute on function operations_helpers.my_status() to authenticated;
create function public.get_my_moderation() returns jsonb language sql stable security invoker set search_path='' as $$ select operations_helpers.my_status(); $$;
revoke all on function public.get_my_moderation() from public,anon,authenticated;
grant execute on function public.get_my_moderation() to authenticated;

