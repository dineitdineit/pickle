create schema moderation_helpers;
revoke all on schema moderation_helpers from public,anon,authenticated;
grant usage on schema moderation_helpers to authenticated;

alter table public.recipe_reviews add column moderation_status text not null default 'active' check (moderation_status in ('active','hidden'));
revoke insert(moderation_status),update(moderation_status) on public.recipe_reviews from authenticated;
create index recipe_reviews_moderation_lookup on public.recipe_reviews(recipe_id,moderation_status,updated_at desc,id desc);
drop policy public_read_recipe_reviews on public.recipe_reviews;
create policy anon_read_active_reviews on public.recipe_reviews for select to anon using (moderation_status='active');
create policy authenticated_read_reviews on public.recipe_reviews for select to authenticated
using (moderation_status='active' or user_id=(select auth.uid()) or (select private.is_admin()));
create or replace function public.recipe_rating_summary(p_recipe_id uuid)
returns table(average_rating numeric,rating_count bigint,review_count bigint,star_1 bigint,star_2 bigint,star_3 bigint,star_4 bigint,star_5 bigint)
language sql stable security invoker set search_path='' as $$
select coalesce(avg(rating),0),count(*),count(*) filter(where content<>''),count(*) filter(where rating=1),count(*) filter(where rating=2),count(*) filter(where rating=3),count(*) filter(where rating=4),count(*) filter(where rating=5)
from public.recipe_reviews where recipe_id=p_recipe_id and moderation_status='active';
$$;

create table public.content_reports (
 id uuid primary key default gen_random_uuid(),
 target_type text not null check(target_type in ('recipe','review','user')),
 target_id uuid not null,
 recipe_id uuid references public.recipes(id) on delete set null,
 reporter_id uuid references public.profiles(id) on delete set null,
 reported_user_id uuid references public.profiles(id) on delete set null,
 reason text not null check(reason in ('spam','harassment','hate_or_abusive','sexual_content','personal_information','off_topic','other')),
 details text check(char_length(details)<=500),
 snapshot jsonb not null,
 status text not null default 'open' check(status in ('open','actioned','dismissed')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 reviewed_by uuid references public.profiles(id) on delete set null,
 resolution_note text check(char_length(resolution_note)<=1000)
);
create unique index content_reports_open_dedup on public.content_reports(target_type,target_id,reporter_id) where status='open';
create index content_reports_queue on public.content_reports(status,target_type,created_at desc,id);
create table public.content_moderation_actions (
 id uuid primary key default gen_random_uuid(),
 report_id uuid not null references public.content_reports(id),
 target_type text not null,
 target_id uuid not null,
 admin_id uuid references public.profiles(id) on delete set null,
 action text not null check(action in ('hide','restore','dismiss','resolve')),
 note text check(char_length(note)<=1000),
 created_at timestamptz not null default now()
);
create index content_moderation_actions_target on public.content_moderation_actions(target_type,target_id,created_at desc);
alter table public.content_reports enable row level security;
alter table public.content_moderation_actions enable row level security;
revoke all on public.content_reports,public.content_moderation_actions from public,anon,authenticated;
grant select on public.content_reports,public.content_moderation_actions to authenticated;
create policy admin_read_content_reports on public.content_reports for select to authenticated using((select private.is_admin()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
create policy admin_read_content_actions on public.content_moderation_actions for select to authenticated using((select private.is_admin()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean,false));
