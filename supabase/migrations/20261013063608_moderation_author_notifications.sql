-- A moderation notice has no visible actor and survives deletion of its target.
alter table public.user_notifications alter column actor_id drop not null;
alter table public.user_notifications add column moderation_event_id uuid;
alter table public.user_notifications add column moderation_details jsonb;
alter table public.user_notifications drop constraint user_notifications_kind_check;
alter table public.user_notifications drop constraint user_notifications_recipe_check;
alter table public.user_notifications add constraint user_notifications_kind_check check(kind in ('follow','new_recipe','moderation'));
alter table public.user_notifications add constraint user_notifications_recipe_check check(
 (kind='follow' and recipe_id is null) or (kind='new_recipe' and recipe_id is not null) or (kind='moderation' and recipe_id is null)
);
alter table public.user_notifications add constraint user_notifications_moderation_check check(
 (kind='moderation' and actor_id is null and moderation_event_id is not null and moderation_details is not null)
 or (kind<>'moderation' and actor_id is not null and moderation_event_id is null and moderation_details is null)
);
create unique index user_notifications_moderation_unique on public.user_notifications(moderation_event_id) where kind='moderation';

create table moderation_helpers.email_outbox (
 id uuid primary key,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 subject text not null,
 body text not null,
 recipient_email text,
 sender text,
 status text not null default 'pending' check(status in ('pending','processing','retry','sent','skipped','failed')),
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 lease_token uuid,
 lease_until timestamptz,
 provider_id text,
 last_error text,
 created_at timestamptz not null default now(),
 sent_at timestamptz
);
alter table moderation_helpers.email_outbox enable row level security;
revoke all on moderation_helpers.email_outbox from public,anon,authenticated;
create index moderation_email_outbox_due on moderation_helpers.email_outbox(next_attempt_at,created_at) where status in ('pending','retry','processing');
create index moderation_email_outbox_recipient on moderation_helpers.email_outbox(recipient_id);

create function moderation_helpers.notify_sanction(p_event uuid,p_recipient uuid,p_type text,p_target uuid,p_title text,p_action text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare title text:=left(coalesce(nullif(btrim(p_title),''),'Untitled recipe'),200);
 reason text; description text; inserted_id uuid;
begin
 if auth.uid() is null or not private.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_type not in ('recipe','review','comment') or p_action not in ('hide','remove') then raise exception 'Invalid sanction notice'; end if;
 if p_recipient is null or not exists(select 1 from public.profiles where id=p_recipient) then return; end if;
 reason:=case p_reason when 'spam' then 'Spam' when 'harassment' then 'Harassment' when 'hate_or_abusive' then 'Hate or abusive content' when 'sexual_content' then 'Sexual content' when 'personal_information' then 'Personal information' when 'off_topic' then 'Off-topic content' else 'Community guidelines' end;
 description:=case p_type when 'recipe' then 'Your recipe "'||title||'"' else 'Your '||p_type||' on "'||title||'"' end
 ||case when p_action='remove' then ' was removed' else ' was hidden' end||' after a moderation review.';
 insert into public.user_notifications(recipient_id,actor_id,kind,moderation_event_id,moderation_details)
 values(p_recipient,null,'moderation',p_event,jsonb_build_object('type',p_type,'target_id',p_target,'title',title,'action',p_action,'reason',reason,'message',description))
 on conflict do nothing returning id into inserted_id;
 if inserted_id is null then return; end if;
 insert into moderation_helpers.email_outbox(id,recipient_id,subject,body)
 values(p_event,p_recipient,'Pickle: Your '||p_type||case when p_action='remove' then ' was removed' else ' was hidden' end,
 description||E'\n\nReason: '||reason||E'\n\nYou can review this notice in Pickle notifications.\nIf you believe this action was a mistake, contact admin@getpickleapp.com.\n\nThe Pickle team')
 on conflict do nothing;
end; $$;
revoke all on function moderation_helpers.notify_sanction(uuid,uuid,text,uuid,text,text,text) from public,anon,authenticated;
create or replace function moderation_helpers.moderate_content_report(p_report_id uuid,p_action text,p_note text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.content_reports; state text; next_status text; before_state text; event_id uuid;
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
  if r.target_type='recipe' then select case when is_hidden then 'hidden' else 'active' end into before_state from public.recipes where id=r.target_id for update;
  else select moderation_status into before_state from public.recipe_reviews where id=r.target_id for update; end if;
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
 insert into public.content_moderation_actions(report_id,target_type,target_id,admin_id,action,note) values(p_report_id,r.target_type,r.target_id,uid,p_action,nullif(btrim(p_note),'')) returning id into event_id;
 if p_action='hide' and before_state is distinct from 'hidden' then perform moderation_helpers.notify_sanction(event_id,r.reported_user_id,r.target_type,r.target_id,r.snapshot->>'title',p_action,r.reason); end if;
 return jsonb_build_object('id',p_report_id,'status',case when p_action='restore' then r.status else next_status end,'target_state',state,'action',p_action);
end; $$;

CREATE OR REPLACE FUNCTION moderation_helpers.moderate_comment_report(p_report_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_comment_id uuid;
  before_state text;
  event_id uuid;
  report public.comment_reports;
  recipe_title text;
begin
  if v_admin_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not (select private.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if p_action is null or p_action not in ('dismiss', 'hide', 'remove') then
    raise exception 'Invalid moderation action';
  end if;

  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Moderation note is too long';
  end if;

  select cr.comment_id
    into v_comment_id
  from public.comment_reports cr
  where cr.id = p_report_id;

  if v_comment_id is null then
    raise exception 'Report not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('comment:'||v_comment_id::text,0));
  perform 1 from public.comment_reports where id=p_report_id and status='open' for update;
  if not found then raise exception 'Report already reviewed; refresh the queue' using errcode='40001'; end if;

  select moderation_status into before_state from public.recipe_comments where id=v_comment_id for update;
  select * into report from public.comment_reports where id=p_report_id;
  select title into recipe_title from public.recipes where id=report.recipe_id;

  if p_action = 'dismiss' then
    update public.comment_reports
    set status = 'dismissed',
        reviewed_at = now(),
        reviewed_by = v_admin_id,
        resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where comment_id = v_comment_id
      and status = 'open';
  elsif p_action = 'hide' then
    update public.recipe_comments
    set moderation_status = 'hidden',
        updated_at = now()
    where id = v_comment_id;
    if not found then raise exception 'Reported comment no longer exists' using errcode='P0002'; end if;

    update public.comment_reports
    set status = 'actioned',
        reviewed_at = now(),
        reviewed_by = v_admin_id,
        resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where comment_id = v_comment_id
      and status = 'open';
  elsif p_action = 'remove' then
    update public.recipe_comments
    set moderation_status = 'removed',
        updated_at = now()
    where id = v_comment_id;
    if not found then raise exception 'Reported comment no longer exists' using errcode='P0002'; end if;

    update public.comment_reports
    set status = 'actioned',
        reviewed_at = now(),
        reviewed_by = v_admin_id,
        resolution_note = nullif(btrim(coalesce(p_note, '')), '')
    where comment_id = v_comment_id
      and status = 'open';
  end if;

  insert into public.moderation_actions (
    report_id,
    comment_id,
    admin_id,
    action,
    note
  )
  values (
    p_report_id,
    v_comment_id,
    v_admin_id,
    p_action,
    nullif(btrim(coalesce(p_note, '')), '')
  ) returning id into event_id;
  if (p_action='hide' and before_state is distinct from 'hidden') or (p_action='remove' and before_state is distinct from 'removed') then
    perform moderation_helpers.notify_sanction(event_id,report.reported_user_id,'comment',v_comment_id,recipe_title,p_action,report.reason);
  end if;
end;
$function$;
