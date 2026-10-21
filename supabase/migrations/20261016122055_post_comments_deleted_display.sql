drop function public.list_post_comments(uuid,uuid,integer);
create function public.list_post_comments(p_post uuid,p_parent uuid default null,p_offset integer default 0)
returns table(id uuid,user_id uuid,parent_id uuid,content text,created_at timestamptz,display_name text,username text,avatar_url text,is_recipe_author boolean,reply_count bigint,is_deleted boolean)
language sql stable security invoker set search_path='' as $$
 select c.id,c.user_id,c.parent_id,c.content,c.created_at,
 case when c.deleted_at is null then a.display_name end,
 case when c.deleted_at is null then a.username end,
 case when c.deleted_at is null then a.avatar_url end,
 coalesce(c.deleted_at is null and r.author_id=c.user_id and post_helpers.can_tag_recipe(r.id),false),
 (select count(*) from public.post_comments reply where reply.parent_id=c.id),c.deleted_at is not null
 from public.post_comments c join public.profiles a on a.id=c.user_id join public.photo_posts p on p.id=c.post_id
 left join public.recipes r on r.id=p.recipe_id
 where c.post_id=p_post and c.parent_id is not distinct from p_parent
 order by c.created_at,c.id limit 21 offset greatest(0,coalesce(p_offset,0));
$$;
revoke all on function public.list_post_comments(uuid,uuid,integer) from public;
grant execute on function public.list_post_comments(uuid,uuid,integer) to anon,authenticated;


