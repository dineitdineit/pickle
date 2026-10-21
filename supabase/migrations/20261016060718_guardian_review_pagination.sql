create function guardian_helpers.requests_page(p_status text,p_offset integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Admin required' using errcode='42501'; end if;
 if p_status is null or p_status not in('pending','approved','declined','revoked') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid page' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from(select g.request_id,g.user_id,g.policy_version,g.status,g.requested_at,g.reviewed_at,g.evidence_reference,p.username,p.display_name
 from guardian_helpers.requests g join public.profiles p on p.id=g.user_id
 where g.status=p_status and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=g.user_id)
 order by g.requested_at,g.request_id limit 50 offset p_offset) r),'[]'::jsonb);
end; $$;
revoke all on function guardian_helpers.requests_page(text,integer) from public,anon;
grant execute on function guardian_helpers.requests_page(text,integer) to authenticated;
create function public.admin_guardian_requests_page(p_status text,p_offset integer) returns jsonb language sql stable security invoker set search_path='' as $$ select guardian_helpers.requests_page(p_status,p_offset); $$;
revoke all on function public.admin_guardian_requests_page(text,integer) from public,anon;
grant execute on function public.admin_guardian_requests_page(text,integer) to authenticated;
notify pgrst,'reload schema';
