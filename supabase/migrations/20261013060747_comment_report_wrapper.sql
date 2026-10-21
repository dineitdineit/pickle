
alter function public.submit_comment_report(uuid,text,text) set schema moderation_helpers;
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

  if p_reason not in (
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

revoke all on function moderation_helpers.submit_comment_report(uuid,text,text) from public,anon,authenticated;
grant execute on function moderation_helpers.submit_comment_report(uuid,text,text) to authenticated;
create function public.submit_comment_report(p_comment_id uuid,p_reason text,p_details text default null) returns uuid language sql security invoker set search_path='' as $$ select moderation_helpers.submit_comment_report(p_comment_id,p_reason,p_details); $$;
revoke all on function public.submit_comment_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_comment_report(uuid,text,text) to authenticated;
