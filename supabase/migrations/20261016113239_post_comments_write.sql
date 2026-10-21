create function post_helpers.write_comment(p_id uuid,p_post uuid,p_parent uuid,p_content text) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.post_comments; root public.post_comments;
begin
 if not operations_helpers.can_act('social') or not consent_helpers.has_current_consent() then raise exception 'Account and policy agreement required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('sanction:'||auth.uid()::text,0));
 if not operations_helpers.can_act('social') or not post_helpers.public_post(p_post) then raise exception 'Post unavailable' using errcode='42501'; end if;
 if p_id is null or p_content is null or char_length(btrim(p_content)) not between 1 and 2000 then raise exception 'Write between 1 and 2000 characters' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('post-comment:'||p_id::text,0));
 select * into existing from public.post_comments where id=p_id;
 if existing.id is not null then
  if existing.user_id=auth.uid() and existing.post_id=p_post and existing.parent_id is not distinct from p_parent and existing.content=btrim(p_content) then return existing.id; end if;
  raise exception 'Comment request does not match' using errcode='42501';
 end if;
 if p_parent is not null then
  select * into root from public.post_comments where id=p_parent for share;
  if root.id is null or root.post_id<>p_post or root.parent_id is not null or not post_helpers.comment_visible(root.id) then raise exception 'Comment unavailable' using errcode='42501'; end if;
 end if;
 if (select count(*) from public.post_comments where user_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then raise exception 'Please wait before posting more comments' using errcode='54000'; end if;
 insert into public.post_comments(id,post_id,user_id,parent_id,content) values(p_id,p_post,auth.uid(),p_parent,btrim(p_content));
 return p_id;
end $$;
revoke all on function post_helpers.write_comment(uuid,uuid,uuid,text) from public,anon;
grant execute on function post_helpers.write_comment(uuid,uuid,uuid,text) to authenticated;
create function public.add_post_comment(p_id uuid,p_post uuid,p_content text,p_parent uuid default null) returns uuid language sql security invoker set search_path='' as $$ select post_helpers.write_comment(p_id,p_post,p_parent,p_content); $$;
revoke all on function public.add_post_comment(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.add_post_comment(uuid,uuid,text,uuid) to authenticated;


