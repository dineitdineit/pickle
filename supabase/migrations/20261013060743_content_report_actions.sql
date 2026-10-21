create function moderation_helpers.moderate_content_report(p_report_id uuid,p_action text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.content_reports; state text; next_status text;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('hide','restore','dismiss','resolve') or char_length(coalesce(p_note,''))>1000 then raise exception 'Invalid moderation action' using errcode='22023'; end if;
 select * into r from public.content_reports where id=p_report_id;
 if not found then raise exception 'Report not found' using errcode='P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.target_type||':'||r.target_id::text,0));
 select * into r from public.content_reports where id=p_report_id for update;
 if r.target_type='user' and p_action not in ('dismiss','resolve') then raise exception 'User reports support review and dismissal only' using errcode='22023'; end if;
 if r.target_type<>'user' and p_action='resolve' then raise exception 'Choose a content moderation action' using errcode='22023'; end if;
 if r.status<>'open' and p_action<>'restore' then raise exception 'Report already reviewed; refresh the queue' using errcode='40001'; end if;
 if p_action in ('hide','restore') then
  if r.target_type='recipe' then update public.recipes set is_hidden=(p_action='hide') where id=r.target_id;
  else update public.recipe_reviews set moderation_status=case when p_action='hide' then 'hidden' else 'active' end where id=r.target_id; end if;
  if not found then raise exception 'Reported content no longer exists' using errcode='P0002'; end if;
  state:=case when p_action='hide' then 'hidden' else 'active' end;
 end if;
 next_status:=case when p_action='dismiss' then 'dismissed' else 'actioned' end;
 if p_action='restore' then
  update public.content_reports set reviewed_at=now(),reviewed_by=uid,resolution_note=nullif(btrim(p_note),'') where id=p_report_id;
 else
  update public.content_reports set status=next_status,reviewed_at=now(),reviewed_by=uid,resolution_note=nullif(btrim(p_note),'')
  where target_type=r.target_type and target_id=r.target_id and status='open';
 end if;
 insert into public.content_moderation_actions(report_id,target_type,target_id,admin_id,action,note) values(p_report_id,r.target_type,r.target_id,uid,p_action,nullif(btrim(p_note),''));
 return jsonb_build_object('id',p_report_id,'status',case when p_action='restore' then r.status else next_status end,'target_state',state,'action',p_action);
end; $$;

revoke all on function moderation_helpers.moderate_content_report(uuid,text,text) from public,anon,authenticated;
grant execute on function moderation_helpers.moderate_content_report(uuid,text,text) to authenticated;
create function public.moderate_content_report(p_report_id uuid,p_action text,p_note text default null) returns jsonb language sql  security invoker set search_path='' as $$ select moderation_helpers.moderate_content_report(p_report_id,p_action,p_note); $$;
revoke all on function public.moderate_content_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.moderate_content_report(uuid,text,text) to authenticated;
