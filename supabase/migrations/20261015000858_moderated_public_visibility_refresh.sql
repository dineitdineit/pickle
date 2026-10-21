create or replace function operations_helpers.apply_decision(p_decision uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.moderation_decisions; c public.moderation_cases; finish timestamptz; message text; target_title text; target_label text;
begin
 perform operations_helpers.require_admin();
 select * into d from public.moderation_decisions where id=p_decision for update;
 select * into c from public.moderation_cases where id=d.case_id for update;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||coalesce(d.subject_id::text,''),0));
 perform pg_advisory_xact_lock(hashtextextended(c.target_type||':'||c.target_id::text,0));
 -- A final finding supersedes only provisional sanctions from this incident.
 if d.state<>'temporary' then
 update public.account_sanctions s set revoked_at=now(),revoked_by=auth.uid()
 from public.moderation_decisions old where old.id=s.decision_id and old.case_id=c.id and old.state='temporary' and s.revoked_at is null;
 end if;
 if d.outcome in('hide','remove','temporary_hide') then
  if d.outcome='temporary_hide' and operations_helpers.target_active(c.id) then update public.moderation_cases set temporary_hidden=true where id=c.id; end if;
  perform operations_helpers.set_target(c.id,case when d.outcome='remove' then 'remove' else 'hide' end);
 elsif d.outcome='dismiss' and c.temporary_hidden and not exists(select 1 from public.moderation_decisions x join public.moderation_cases other on other.id=x.case_id where other.target_type=c.target_type and other.target_id=c.target_id and x.case_id<>c.id and x.state='confirmed' and x.outcome in('hide','remove')) then
  perform operations_helpers.set_target(c.id,'restore');
 end if;
 if d.sanction not in('none','warning') and d.subject_id is not null then
  finish:=case d.sanction when 'restrict_3' then now()+interval '3 days' when 'suspend_7' then now()+interval '7 days' when 'suspend_30' then now()+interval '30 days' when 'temp_suspend' then now()+interval '24 hours' when 'report_limit_7' then now()+interval '7 days' else null end;
  insert into public.account_sanctions(decision_id,user_id,kind,ends_at) values(d.id,d.subject_id,d.sanction,finish);
 end if;
 update public.moderation_decisions set notified_at=now(),updated_at=clock_timestamp() where id=d.id;
 if d.state='temporary' then
  update public.moderation_cases set status=case when d.outcome='request_info' then 'needs_info' else 'reviewing' end,first_response_at=coalesce(first_response_at,now()),updated_at=clock_timestamp() where id=c.id;
 else
  update public.content_reports set status=case when d.outcome='dismiss' then 'dismissed' else 'actioned' end,reviewed_at=now(),reviewed_by=auth.uid(),resolution_note=d.internal_note where target_type=c.target_type and target_id=c.target_id and status='open';
  if c.target_type='comment' then update public.comment_reports set status=case when d.outcome='dismiss' then 'dismissed' else 'actioned' end,reviewed_at=now(),reviewed_by=auth.uid(),resolution_note=d.internal_note where comment_id=c.target_id and status='open'; end if;
  update public.moderation_cases set status='closed',updated_at=clock_timestamp() where id=c.id;
 end if;
 target_title:=case c.target_type
 when 'recipe' then (select title from public.recipes where id=c.target_id)
 when 'review' then (select r.title from public.recipe_reviews v join public.recipes r on r.id=v.recipe_id where v.id=c.target_id)
 when 'comment' then (select r.title from public.recipe_comments v join public.recipes r on r.id=v.recipe_id where v.id=c.target_id)
 else null end;
 target_label:=case when c.target_type='user' then 'Your account' else 'Your '||c.target_type||case when target_title is not null then ' on "'||left(target_title,200)||'"' else '' end end;
 message:=target_label||'. '||case when d.state='temporary' then 'A report is being reviewed. Provisional action: ' when d.outcome='dismiss' then 'A report about your content was reviewed; a violation was not confirmed. Action: ' else 'A policy violation was confirmed. Content action: ' end||d.outcome||'. Account action: '||d.sanction||'.'
 ||case when finish is not null then ' Restriction ends: '||to_char(finish at time zone 'UTC','YYYY-MM-DD HH24:MI')||' UTC.' when d.sanction='permanent' then ' The suspension has no automatic end date.' else '' end;
 perform operations_helpers.notice(d.id,d.subject_id,'account',d.outcome,'Clause: '||d.clause||'. '||d.public_reason,message,c.id,true);
 insert into public.moderation_case_events(case_id,actor_id,action,note) values(c.id,auth.uid(),'decision:'||d.outcome||':'||d.sanction,d.internal_note);
 return (select to_jsonb(x) from public.moderation_decisions x where id=d.id);
end; $$;

create or replace function search_suggestion_helpers.search_ranked_users(p_query text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g')); result jsonb;
begin
  if q='' or char_length(q)>80 or p_offset is null or p_offset<0 or p_offset>100000 then return jsonb_build_object('users','[]'::jsonb,'has_more',false); end if;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc,c.view_count desc,c.username,c.id),'[]'::jsonb) into result from (
    select p.id,p.username,p.display_name,p.avatar_url,count(distinct r.id) recipe_count,count(v.id) view_count
    from public.profiles p left join public.recipes r on r.author_id=p.id and r.is_hidden=false left join public.recipe_views v on v.recipe_id=r.id
    where not p.moderation_hidden and not blocking_helpers.viewer_blocked(p.id) and (position(q in lower(coalesce(p.username,'')))>0 or position(q in lower(coalesce(p.display_name,'')))>0)
    group by p.id,p.username,p.display_name,p.avatar_url
    order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 21 offset p_offset
  ) c;
  return jsonb_build_object('users',(select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) from jsonb_array_elements(result) with ordinality e(value,ord) where ord<=20),'has_more',jsonb_array_length(result)>20);
end; $$;

create or replace function search_suggestion_helpers.get_search_suggestions(p_query text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare q text:=lower(regexp_replace(btrim(coalesce(p_query,'')),'\s+',' ','g')); keywords jsonb; cooks jsonb;
begin
  if q='' or char_length(q)>80 then return jsonb_build_object('keywords','[]'::jsonb,'users','[]'::jsonb); end if;
  select coalesce(jsonb_agg(to_jsonb(k) order by k.search_count desc,k.keyword),'[]'::jsonb) into keywords from (
    select e.normalized_query as keyword,count(*) as search_count
    from public.search_events e
    where e.searched_at>=now()-interval '30 days' and e.result_count>0
      and char_length(e.normalized_query) between 1 and 80 and position(q in e.normalized_query)>0
    group by e.normalized_query having count(*)>=2
    order by count(*) desc,e.normalized_query limit 6
  ) k;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.recipe_count desc,c.view_count desc,c.username,c.id),'[]'::jsonb) into cooks from (
    select p.id,p.username,p.display_name,p.avatar_url,count(distinct r.id) as recipe_count,count(v.id) as view_count
    from public.profiles p
    left join public.recipes r on r.author_id=p.id and r.is_hidden=false
    left join public.recipe_views v on v.recipe_id=r.id
    where not p.moderation_hidden and not blocking_helpers.viewer_blocked(p.id) and (position(q in lower(coalesce(p.username,'')))>0 or position(q in lower(coalesce(p.display_name,'')))>0)
    group by p.id,p.username,p.display_name,p.avatar_url
    order by count(distinct r.id) desc,count(v.id) desc,p.username,p.id limit 8
  ) c;
  return jsonb_build_object('keywords',keywords,'users',cooks);
end; $$;

create table operations_helpers.visibility_epoch (
 singleton boolean primary key default true check(singleton),
 version uuid not null default gen_random_uuid()
);
alter table operations_helpers.visibility_epoch enable row level security;
revoke all on operations_helpers.visibility_epoch from public,anon,authenticated;
insert into operations_helpers.visibility_epoch(singleton) values(true);
create function operations_helpers.public_visibility_version() returns text
language sql stable security definer set search_path='' as $$
 select version::text from operations_helpers.visibility_epoch where singleton;
$$;
revoke all on function operations_helpers.public_visibility_version() from public,anon,authenticated;
grant execute on function operations_helpers.public_visibility_version() to anon,authenticated;
create function public.get_public_visibility_version() returns text
language sql stable security invoker set search_path='' as $$
 select operations_helpers.public_visibility_version();
$$;
revoke all on function public.get_public_visibility_version() from public,anon,authenticated;
grant execute on function public.get_public_visibility_version() to anon,authenticated;
create function operations_helpers.bump_visibility() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if (to_jsonb(old)->'is_hidden',to_jsonb(old)->'moderation_status',to_jsonb(old)->'moderation_removed',to_jsonb(old)->'moderation_hidden')
 is distinct from (to_jsonb(new)->'is_hidden',to_jsonb(new)->'moderation_status',to_jsonb(new)->'moderation_removed',to_jsonb(new)->'moderation_hidden') then
 update operations_helpers.visibility_epoch set version=gen_random_uuid() where singleton;
 end if;
 return new;
end; $$;
revoke all on function operations_helpers.bump_visibility() from public,anon,authenticated;
create trigger moderation_visibility_refresh after update on public.recipes for each row execute function operations_helpers.bump_visibility();
create trigger moderation_visibility_refresh after update on public.recipe_comments for each row execute function operations_helpers.bump_visibility();
create trigger moderation_visibility_refresh after update on public.recipe_reviews for each row execute function operations_helpers.bump_visibility();
create trigger moderation_visibility_refresh after update on public.profiles for each row execute function operations_helpers.bump_visibility();

create or replace function blocking_helpers.safety_version() returns text
language plpgsql stable security definer set search_path='' as $$
declare blocks text; sanctions text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Log in required' using errcode='42501'; end if;
 select coalesce(string_agg(blocker_id::text||':'||blocked_id::text||':'||created_at::text,',' order by blocker_id,blocked_id),'') into blocks from public.user_blocks where blocker_id=auth.uid() or blocked_id=auth.uid();
 select coalesce(string_agg(id::text||':'||coalesce(revoked_at::text,'')||':'||coalesce((ends_at>now())::text,'permanent'),',' order by id),'') into sanctions from public.account_sanctions where user_id=auth.uid();
 return md5(blocks||'|'||sanctions||'|'||operations_helpers.public_visibility_version());
end; $$;
