alter table public.post_comments add column deleted_at timestamptz;
create function post_helpers.remove_comment(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 if not exists(select 1 from public.post_comments where id=p_id and user_id=auth.uid()) then raise exception 'Comment unavailable' using errcode='42501'; end if;
 -- Preserve other users' replies; erase only the requesting user's text.
 update public.post_comments set content='Comment deleted',deleted_at=coalesce(deleted_at,now()) where id=p_id and user_id=auth.uid();
 return p_id;
end $$;
revoke all on function post_helpers.remove_comment(uuid) from public,anon;
grant execute on function post_helpers.remove_comment(uuid) to authenticated;
create function public.delete_post_comment(p_id uuid) returns uuid language sql security invoker set search_path='' as $$ select post_helpers.remove_comment(p_id); $$;
revoke all on function public.delete_post_comment(uuid) from public,anon;
grant execute on function public.delete_post_comment(uuid) to authenticated;


