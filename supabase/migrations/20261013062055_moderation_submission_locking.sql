create or replace function moderation_helpers.submit_content_report(p_type text,p_target_id uuid,p_reason text,p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner_id uuid; rid uuid; snap jsonb; report_id uuid;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_type is null or p_type not in ('recipe','review','user') or p_target_id is null or p_reason is null or p_reason not in ('spam','harassment','hate_or_abusive','sexual_content','personal_information','off_topic','other') or char_length(coalesce(p_details,''))>500 then raise exception 'Invalid report' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_type||':'||p_target_id::text,0));
 if p_type='recipe' then
  select r.author_id,r.id,jsonb_build_object('title',r.title,'content',coalesce(r.short_description,r.description,'')) into owner_id,rid,snap from public.recipes r where r.id=p_target_id and not r.is_hidden;
 elsif p_type='review' then
  select v.user_id,v.recipe_id,jsonb_build_object('title',r.title,'rating',v.rating,'content',v.content) into owner_id,rid,snap from public.recipe_reviews v join public.recipes r on r.id=v.recipe_id where v.id=p_target_id and v.moderation_status='active' and not r.is_hidden;
 else
  select p.id,null::uuid,jsonb_build_object('title',coalesce(nullif(p.display_name,''),p.username),'username',p.username,'content',coalesce(p.bio,'')) into owner_id,rid,snap from public.profiles p where p.id=p_target_id;
 end if;
 if owner_id is null then raise exception 'Content is not available for reporting' using errcode='P0002'; end if;
 if owner_id=uid then raise exception 'You cannot report your own content' using errcode='22023'; end if;
 insert into public.content_reports(target_type,target_id,recipe_id,reporter_id,reported_user_id,reason,details,snapshot)
 values(p_type,p_target_id,rid,uid,owner_id,p_reason,nullif(btrim(p_details),''),snap)
 on conflict(target_type,target_id,reporter_id) where status='open' do nothing returning id into report_id;
 if report_id is null then select r.id into report_id from public.content_reports r where r.target_type=p_type and r.target_id=p_target_id and r.reporter_id=uid and r.status='open'; end if;
 return jsonb_build_object('id',report_id,'target_type',p_type,'target_id',p_target_id,'status','open');
end; $$;


CREATE OR REPLACE FUNCTION moderation_helpers.submit_comment_report(p_comment_id uuid, p_reason text, p_details text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := (select auth.uid());
  v_recipe_id uuid;
  v_reported_user_id uuid;
  v_content text;
  v_status text;
  v_report_id uuid;
begin
  if v_user_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Authentication required';
  end if;

  if p_reason is null or p_reason not in (
    'spam',
    'harassment',
    'hate_or_abusive',
    'sexual_content',
    'personal_information',
    'off_topic',
    'other'
  ) then
    raise exception 'Invalid report reason';
  end if;

  if p_details is not null and char_length(p_details) > 500 then
    raise exception 'Report details are too long';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('comment:'||p_comment_id::text,0));

  select c.recipe_id, c.user_id, c.content, c.moderation_status
    into v_recipe_id, v_reported_user_id, v_content, v_status
  from public.recipe_comments c
  where c.id = p_comment_id;

  if v_recipe_id is null then
    raise exception 'Comment not found';
  end if;

  if v_status <> 'active' then
    raise exception 'Comment is not available for reporting';
  end if;

  if v_reported_user_id = v_user_id then
    raise exception 'You cannot report your own comment';
  end if;

  insert into public.comment_reports (
    comment_id,
    recipe_id,
    reporter_id,
    reported_user_id,
    reason,
    details,
    comment_snapshot
  )
  values (
    p_comment_id,
    v_recipe_id,
    v_user_id,
    v_reported_user_id,
    p_reason,
    nullif(btrim(coalesce(p_details, '')), ''),
    v_content
  )
  on conflict (comment_id, reporter_id) do nothing
  returning id into v_report_id;

  if v_report_id is null then
    select cr.id
      into v_report_id
    from public.comment_reports cr
    where cr.comment_id = p_comment_id
      and cr.reporter_id = v_user_id;
  end if;

  return v_report_id;
end;
$function$;

CREATE OR REPLACE FUNCTION moderation_helpers.moderate_comment_report(p_report_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin_id uuid := (select auth.uid());
  v_comment_id uuid;
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
  );
end;
$function$;
