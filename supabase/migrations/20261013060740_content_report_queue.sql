create function moderation_helpers.admin_content_reports(p_type text default 'all',p_status text default 'open',p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; total bigint;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not private.is_admin() then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_type is null or p_type not in ('all','recipe','review','user') or p_status is null or p_status not in ('all','open','actioned','dismissed') or p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid filter' using errcode='22023'; end if;
 select count(*) into total from public.content_reports r where (p_type='all' or r.target_type=p_type) and (p_status='all' or r.status=p_status);
 select coalesce(jsonb_agg(item order by created_at desc,id),'[]'::jsonb) into result from (
  select r.created_at,r.id,to_jsonb(r)||jsonb_build_object(
   'reporter_name',(select coalesce(nullif(p.display_name,''),p.username) from public.profiles p where p.id=r.reporter_id),
   'reported_name',(select coalesce(nullif(p.display_name,''),p.username) from public.profiles p where p.id=r.reported_user_id),
   'target_state',case r.target_type when 'recipe' then (select case when x.is_hidden then 'hidden' else 'active' end from public.recipes x where x.id=r.target_id) when 'review' then (select x.moderation_status from public.recipe_reviews x where x.id=r.target_id) else case when exists(select 1 from public.profiles x where x.id=r.target_id) then 'active' else null end end,
   'actions',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc,a.id),'[]'::jsonb) from public.content_moderation_actions a where a.target_type=r.target_type and a.target_id=r.target_id)
  ) as item from public.content_reports r where (p_type='all' or r.target_type=p_type) and (p_status='all' or r.status=p_status) order by r.created_at desc,r.id limit 50 offset p_offset
 ) page;
 return jsonb_build_object('reports',result,'total',total,'has_more',p_offset+50<total);
end; $$;


revoke all on function moderation_helpers.admin_content_reports(text,text,integer) from public,anon,authenticated;
grant execute on function moderation_helpers.admin_content_reports(text,text,integer) to authenticated;
create function public.admin_content_reports(p_type text default 'all',p_status text default 'open',p_offset integer default 0) returns jsonb language sql stable security invoker set search_path='' as $$ select moderation_helpers.admin_content_reports(p_type,p_status,p_offset); $$;
revoke all on function public.admin_content_reports(text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_content_reports(text,text,integer) to authenticated;
