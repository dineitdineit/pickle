
alter function public.moderate_comment_report(uuid,text,text) set schema moderation_helpers;
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

  if p_action not in ('dismiss', 'hide', 'remove') then
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

revoke all on function moderation_helpers.moderate_comment_report(uuid,text,text) from public,anon,authenticated;
grant execute on function moderation_helpers.moderate_comment_report(uuid,text,text) to authenticated;
create function public.moderate_comment_report(p_report_id uuid,p_action text,p_note text default null) returns void language sql security invoker set search_path='' as $$ select moderation_helpers.moderate_comment_report(p_report_id,p_action,p_note); $$;
revoke all on function public.moderate_comment_report(uuid,text,text) from public,anon,authenticated;
grant execute on function public.moderate_comment_report(uuid,text,text) to authenticated;
