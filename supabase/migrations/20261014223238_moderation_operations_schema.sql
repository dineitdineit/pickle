create schema operations_helpers;
revoke all on schema operations_helpers from public,anon,authenticated;
grant usage on schema operations_helpers to authenticated;
alter table public.recipes add column moderation_removed boolean not null default false;
alter table public.recipe_reviews add column moderation_removed boolean not null default false;
create table public.moderation_cases(
 id uuid primary key default gen_random_uuid(),
 target_type text not null check(target_type in('recipe','review','comment','user')),
 target_id uuid not null, subject_id uuid references public.profiles(id) on delete set null,
 priority text not null default 'normal' check(priority in('urgent','high','normal','needs_info')),
 assignee_id uuid references public.profiles(id) on delete set null,
 status text not null default 'open' check(status in('open','reviewing','needs_info','proposed','closed')),
 temporary_hidden boolean not null default false,
 first_response_at timestamptz, due_at timestamptz not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default clock_timestamp()
);
create unique index moderation_one_open_incident on public.moderation_cases(target_type,target_id) where status<>'closed';
create index moderation_case_queue on public.moderation_cases(status,priority,due_at,id);
create index moderation_case_subject on public.moderation_cases(subject_id,created_at desc);
create index moderation_case_assignee on public.moderation_cases(assignee_id,status);
create table public.moderation_case_reports(
 case_id uuid not null references public.moderation_cases(id) on delete cascade,
 source text not null check(source in('content','comment')),
 report_id uuid not null, reporter_id uuid references public.profiles(id) on delete set null,
 primary key(source,report_id)
);
create index moderation_case_reports_case on public.moderation_case_reports(case_id);
create index moderation_case_reports_reporter on public.moderation_case_reports(reporter_id);
create table public.moderation_decisions(
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.moderation_cases(id),
 subject_id uuid references public.profiles(id) on delete set null,
 outcome text not null check(outcome in('dismiss','request_changes','hide','remove','temporary_hide','request_info')),
 severity text not null check(severity in('minor','standard','repeated','critical')),
 clause text not null check(clause in('harassment','sexual_exploitation','privacy','scam_spam','copyright_impersonation','dangerous_content','rating_manipulation','evasion','false_reports','none')),
 public_reason text not null check(char_length(public_reason) between 10 and 1000),
 internal_note text not null check(char_length(internal_note) between 10 and 2000),
 sanction text not null check(sanction in('none','warning','restrict_3','suspend_7','suspend_30','permanent','temp_suspend','report_limit_7')),
 state text not null check(state in('temporary','proposed','confirmed','dismissed','overturned','rejected')),
 proposed_by uuid references public.profiles(id) on delete set null,
 approved_by uuid references public.profiles(id) on delete set null,
 approval_note text, notified_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default clock_timestamp()
);
create unique index moderation_one_violation_per_case on public.moderation_decisions(case_id) where state in('proposed','confirmed');
create index moderation_decision_subject on public.moderation_decisions(subject_id,created_at desc);
create index moderation_decision_proposer on public.moderation_decisions(proposed_by);
create index moderation_decision_approver on public.moderation_decisions(approved_by);
create table public.account_sanctions(
 id uuid primary key default gen_random_uuid(),
 decision_id uuid not null unique references public.moderation_decisions(id),
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('restrict_3','suspend_7','suspend_30','permanent','temp_suspend','report_limit_7')),
 starts_at timestamptz not null default now(), ends_at timestamptz,
 revoked_at timestamptz, revoked_by uuid references public.profiles(id) on delete set null,
 check((kind='permanent' and ends_at is null) or (kind<>'permanent' and ends_at>starts_at))
);
create index active_account_sanctions on public.account_sanctions(user_id,ends_at) where revoked_at is null;
create index account_sanctions_revoker on public.account_sanctions(revoked_by);
create table public.moderation_appeals(
 id uuid primary key default gen_random_uuid(),
 decision_id uuid not null unique references public.moderation_decisions(id),
 user_id uuid not null references public.profiles(id) on delete cascade,
 explanation text not null check(char_length(explanation) between 20 and 2000),
 status text not null default 'open' check(status in('open','upheld','overturned')),
 response text, internal_note text, reviewed_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), due_at timestamptz not null, reviewed_at timestamptz
);
create index moderation_appeal_queue on public.moderation_appeals(status,due_at,id);
create index moderation_appeal_user on public.moderation_appeals(user_id);
create index moderation_appeal_reviewer on public.moderation_appeals(reviewed_by);
create table public.moderation_case_events(
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.moderation_cases(id),
 actor_id uuid references public.profiles(id) on delete set null,
 action text not null, note text not null,
 created_at timestamptz not null default now()
);
create index moderation_case_event_history on public.moderation_case_events(case_id,created_at desc,id);
create index moderation_case_event_actor on public.moderation_case_events(actor_id);

do $$ declare tab text; begin
 foreach tab in array array['moderation_cases','moderation_case_reports','moderation_decisions','account_sanctions','moderation_appeals','moderation_case_events'] loop
  execute format('alter table public.%I enable row level security',tab);
  execute format('revoke all on public.%I from public,anon,authenticated',tab);
  execute format('grant select on public.%I to authenticated',tab);
  execute format('create policy admin_operations_read on public.%I for select to authenticated using((select private.is_admin()) and not coalesce((select (auth.jwt()->>''is_anonymous'')::boolean),false))',tab);
 end loop;
end; $$;
create policy own_account_sanctions on public.account_sanctions for select to authenticated using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));
-- Appeals/decisions expose safe owner projections through RPC, never raw internal notes.

create function operations_helpers.require_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not private.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
end; $$;
revoke all on function operations_helpers.require_admin() from public,anon,authenticated;
create function operations_helpers.business_due(p_start timestamptz,p_days integer) returns timestamptz
language plpgsql immutable security invoker set search_path='' as $$
declare deadline timestamptz:=p_start; added integer:=0;
begin
 if p_days<0 or p_days>30 then raise exception 'Invalid days'; end if;
 while added<p_days loop deadline:=deadline+interval '1 day'; if extract(isodow from deadline at time zone 'Asia/Seoul')<6 then added:=added+1; end if; end loop;
 return deadline;
end; $$;
revoke all on function operations_helpers.business_due(timestamptz,integer) from public,anon,authenticated;
create function operations_helpers.responsible() returns boolean language sql stable security definer set search_path='' as $$
select private.is_admin() and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
and (exists(select 1 from public.profiles where id=auth.uid() and role='official') or not exists(select 1 from public.profiles where role='official'));
$$;
revoke all on function operations_helpers.responsible() from public,anon,authenticated;

