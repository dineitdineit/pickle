-- New reports cannot bypass assignment, evidence, strikes or approval via old RPCs.
create function operations_helpers.legacy_content(p_report uuid,p_action text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.content_reports;
begin
 perform operations_helpers.require_admin();
 select * into r from public.content_reports where id=p_report;
 if not found then raise exception 'Report not found' using errcode='P0002'; end if;
 if r.reporter_id=auth.uid() or r.reported_user_id=auth.uid() then raise exception 'Conflict of interest' using errcode='42501'; end if;
 if exists(select 1 from public.moderation_case_reports where source='content' and report_id=p_report) or p_action<>'restore' then raise exception 'Use Moderation > Operations & appeals for a structured decision' using errcode='42501'; end if;
 if not operations_helpers.responsible() or char_length(btrim(coalesce(p_note,'')))<10 then raise exception 'Responsible operator and review note required' using errcode='42501'; end if;
 return moderation_helpers.moderate_content_report(p_report,p_action,p_note);
end; $$;
revoke all on function operations_helpers.legacy_content(uuid,text,text) from public,anon,authenticated;
grant execute on function operations_helpers.legacy_content(uuid,text,text) to authenticated;
create or replace function public.moderate_content_report(p_report_id uuid,p_action text,p_note text default null) returns jsonb
language sql security invoker set search_path='' as $$ select operations_helpers.legacy_content(p_report_id,p_action,p_note); $$;
create or replace function public.moderate_comment_report(p_report_id uuid,p_action text,p_note text default null) returns void
language plpgsql security invoker set search_path='' as $$
begin raise exception 'Use Moderation > Operations & appeals for a structured decision' using errcode='42501'; end; $$;
revoke execute on function moderation_helpers.moderate_content_report(uuid,text,text) from authenticated;
revoke execute on function moderation_helpers.moderate_comment_report(uuid,text,text) from authenticated;

