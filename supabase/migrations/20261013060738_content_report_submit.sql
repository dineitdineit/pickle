create function moderation_helpers.submit_content_report(p_type text,p_target_id uuid,p_reason text,p_details text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owner_id uuid; rid uuid; snap jsonb; report_id uuid;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_type is null or p_type not in ('recipe','review','user') or p_target_id is null or p_reason is null or p_reason not in ('spam','harassment','hate_or_abusive','sexual_content','personal_information','off_topic','other') or char_length(coalesce(p_details,''))>500 then raise exception 'Invalid report' using errcode='22023'; end if;
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


revoke all on function moderation_helpers.submit_content_report(text,uuid,text,text) from public,anon,authenticated;
grant execute on function moderation_helpers.submit_content_report(text,uuid,text,text) to authenticated;
create function public.submit_content_report(p_type text,p_target_id uuid,p_reason text,p_details text default null) returns jsonb language sql  security invoker set search_path='' as $$ select moderation_helpers.submit_content_report(p_type,p_target_id,p_reason,p_details); $$;
revoke all on function public.submit_content_report(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.submit_content_report(text,uuid,text,text) to authenticated;
