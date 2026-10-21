create schema guardian_helpers;
revoke all on schema guardian_helpers from public,anon,authenticated;
grant usage on schema guardian_helpers to authenticated;
alter table public.account_age_confirmations drop constraint account_age_confirmations_minimum_age_check;
alter table public.account_age_confirmations drop constraint account_age_confirmations_rule_version_check;
alter table public.account_age_confirmations add column requires_guardian boolean not null default false;
alter table public.account_age_confirmations add constraint account_age_rule_check check(
 (rule_version='18-plus-v1' and minimum_age=18 and not requires_guardian) or
 (rule_version='13-plus-guardian-v1' and ((minimum_age=13 and requires_guardian) or (minimum_age=14 and not requires_guardian))));
create table guardian_helpers.requests (
 request_id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 policy_version text not null references public.content_policy_versions(version),
 status text not null default 'pending' check(status in('pending','approved','declined','revoked')),
 requested_at timestamptz not null default now(), reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id) on delete set null,
 evidence_reference text check(evidence_reference is null or char_length(evidence_reference) between 6 and 160),
 unique(user_id,policy_version),
 check((status='pending' and reviewed_at is null and evidence_reference is null) or (status<>'pending' and reviewed_at is not null and evidence_reference is not null))
);
create table guardian_helpers.reviews (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references guardian_helpers.requests(request_id) on delete cascade,
 decision text not null check(decision in('approved','declined','revoked')),
 evidence_reference text not null check(char_length(evidence_reference) between 6 and 160),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz not null default now()
);
create index guardian_reviews_request on guardian_helpers.reviews(request_id);
alter table guardian_helpers.reviews enable row level security;
revoke all on guardian_helpers.reviews from public,anon,authenticated;
create index guardian_requests_review on guardian_helpers.requests(status,requested_at);
alter table guardian_helpers.requests enable row level security;
revoke all on guardian_helpers.requests from public,anon,authenticated;

create or replace function operations_helpers.age_eligible() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and exists(select 1 from public.account_age_confirmations a where a.user_id=auth.uid() and
 ((a.rule_version='18-plus-v1' and a.minimum_age=18 and not a.requires_guardian) or
 (a.rule_version='13-plus-guardian-v1' and (not a.requires_guardian or exists(
 select 1 from guardian_helpers.requests g join public.content_policy_versions v on v.version=g.policy_version and v.active
 where g.user_id=a.user_id and g.status='approved')))));
$$;
create or replace function operations_helpers.age_status() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare required boolean; request guardian_helpers.requests;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 select requires_guardian into required from public.account_age_confirmations where user_id=auth.uid();
 if coalesce(required,false) then select g.* into request from guardian_helpers.requests g join public.content_policy_versions v on v.version=g.policy_version and v.active where g.user_id=auth.uid(); end if;
 return jsonb_build_object('user_id',auth.uid(),'eligible',operations_helpers.age_eligible(),'minimum_age',13,'rule_version','13-plus-guardian-v1',
 'guardian_required',coalesce(required,false),'guardian_status',case when coalesce(required,false) then coalesce(request.status,'not_requested') else 'not_required' end,
 'guardian_request_id',request.request_id,'guardian_policy_version',request.policy_version);
end; $$;

create function guardian_helpers.request_consent() returns jsonb language plpgsql security definer set search_path='' as $$
declare version text;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('age:'||auth.uid()::text,0));
 if not exists(select 1 from public.account_age_confirmations where user_id=auth.uid() and requires_guardian) then raise exception 'Guardian request unavailable' using errcode='42501'; end if;
 if exists(select 1 from operations_helpers.account_deletions where user_id=auth.uid()) then raise exception 'Account deleting' using errcode='42501'; end if;
 select v.version into version from public.content_policy_versions v where v.active;
 if version is null then raise exception 'Policy unavailable' using errcode='42501'; end if;
 insert into guardian_helpers.requests(user_id,policy_version) values(auth.uid(),version) on conflict(user_id,policy_version) do nothing;
 return operations_helpers.age_status();
end; $$;
revoke all on function guardian_helpers.request_consent() from public,anon;
grant execute on function guardian_helpers.request_consent() to authenticated;
create function public.request_guardian_consent() returns jsonb language sql security invoker set search_path='' as $$ select guardian_helpers.request_consent(); $$;
revoke all on function public.request_guardian_consent() from public,anon;
grant execute on function public.request_guardian_consent() to authenticated;

create or replace function operations_helpers.confirm_age(p_birth_date date) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'UTC')::date; guardian boolean;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_birth_date is null or p_birth_date>today or p_birth_date<(today-interval '120 years')::date then raise exception 'Enter a valid birth date' using errcode='22023'; end if;
 if p_birth_date>(today-interval '13 years')::date then raise exception 'Pickle accounts require age 13 or over' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('age:'||auth.uid()::text,0));
 if exists(select 1 from operations_helpers.account_deletions where user_id=auth.uid()) then raise exception 'Account deleting' using errcode='42501'; end if;
 guardian:=p_birth_date>(today-interval '14 years')::date;
 -- Existing records are immutable to the client. A declared 13-year-old cannot
 -- clear pending/revoked guardian requirements by submitting another birthday.
 insert into public.account_age_confirmations(user_id,rule_version,minimum_age,requires_guardian)
 values(auth.uid(),'13-plus-guardian-v1',case when guardian then 13 else 14 end,guardian) on conflict do nothing;
 if exists(select 1 from public.account_age_confirmations where user_id=auth.uid() and requires_guardian) then return guardian_helpers.request_consent(); end if;
 return operations_helpers.age_status();
end; $$;

create function guardian_helpers.admin_requests(p_status text default 'pending') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Admin required' using errcode='42501'; end if;
 if p_status not in('pending','approved','declined','revoked') or p_status is null then raise exception 'Invalid status' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from(select g.request_id,g.user_id,g.policy_version,g.status,g.requested_at,g.reviewed_at,g.evidence_reference,p.username,p.display_name
 from guardian_helpers.requests g join public.profiles p on p.id=g.user_id
 where g.status=p_status and not exists(select 1 from operations_helpers.account_deletions d where d.user_id=g.user_id)
 order by g.requested_at,g.request_id limit 50) r),'[]'::jsonb);
end; $$;
revoke all on function guardian_helpers.admin_requests(text) from public,anon;
grant execute on function guardian_helpers.admin_requests(text) to authenticated;
create function public.admin_guardian_requests(p_status text default 'pending') returns jsonb language sql stable security invoker set search_path='' as $$ select guardian_helpers.admin_requests(p_status); $$;
revoke all on function public.admin_guardian_requests(text) from public,anon;
grant execute on function public.admin_guardian_requests(text) to authenticated;

create function guardian_helpers.review(p_request_id uuid,p_decision text,p_evidence_reference text,p_verified boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare request guardian_helpers.requests; child uuid; evidence text:=btrim(p_evidence_reference);
begin
 if auth.uid() is null or not private.is_admin() or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Admin required' using errcode='42501'; end if;
 if p_decision is null or p_decision not in('approved','declined','revoked') or evidence is null or char_length(evidence) not between 6 and 160 then raise exception 'Decision and internal evidence reference required' using errcode='22023'; end if;
 select user_id into child from guardian_helpers.requests where request_id=p_request_id;
 if child is null or child=auth.uid() then raise exception 'Independent guardian review required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('age:'||child::text,0));
 select * into request from guardian_helpers.requests where request_id=p_request_id for update;
 if request.request_id is null or exists(select 1 from operations_helpers.account_deletions where user_id=child) then raise exception 'Request unavailable' using errcode='42501'; end if;
 if request.status=p_decision and request.evidence_reference=evidence then return jsonb_build_object('request_id',request.request_id,'status',request.status); end if;
 if (p_decision='declined' and request.status<>'pending') or (p_decision='revoked' and request.status<>'approved') or (p_decision='approved' and request.status='approved') then raise exception 'Request changed. Reload before reviewing.' using errcode='40001'; end if;
 if p_decision='approved' and (p_verified is distinct from true or not exists(select 1 from public.content_policy_versions where version=request.policy_version and active)) then raise exception 'Current-policy guardian verification required' using errcode='42501'; end if;
 insert into guardian_helpers.reviews(request_id,decision,evidence_reference,reviewed_by) values(p_request_id,p_decision,evidence,auth.uid());
 update guardian_helpers.requests set status=p_decision,reviewed_at=now(),reviewed_by=auth.uid(),evidence_reference=evidence where request_id=p_request_id;
 return jsonb_build_object('request_id',p_request_id,'status',p_decision);
end; $$;
revoke all on function guardian_helpers.review(uuid,text,text,boolean) from public,anon;
grant execute on function guardian_helpers.review(uuid,text,text,boolean) to authenticated;
create function public.review_guardian_consent(p_request_id uuid,p_decision text,p_evidence_reference text,p_verified boolean default false) returns jsonb language sql security invoker set search_path='' as $$ select guardian_helpers.review(p_request_id,p_decision,p_evidence_reference,p_verified); $$;
revoke all on function public.review_guardian_consent(uuid,text,text,boolean) from public,anon;
grant execute on function public.review_guardian_consent(uuid,text,text,boolean) to authenticated;

-- Pending/declined/revoked requests are short-lived. Keep approved consent while
-- its account is active; all request rows cascade on account deletion.
do $patch$ declare definition text; begin
 select pg_get_functiondef('retention_helpers.purge_records()'::regprocedure) into definition;
 definition:=replace(definition,'delete from public.search_events','delete from guardian_helpers.requests where status<>''approved'' and coalesce(reviewed_at,requested_at)<=now()-interval ''30 days''; delete from public.search_events');
 execute definition;
end; $patch$;
-- Hide a guardian-gated account from public profile/search/media reads until
-- consent is active. Absence of an age record preserves existing adult accounts.
create function guardian_helpers.public_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.account_age_confirmations a where a.user_id=p_user and a.requires_guardian)
 or exists(select 1 from guardian_helpers.requests g join public.content_policy_versions v on v.version=g.policy_version and v.active where g.user_id=p_user and g.status='approved');
$$;
revoke all on function guardian_helpers.public_allowed(uuid) from public;
grant usage on schema guardian_helpers to anon;
grant execute on function guardian_helpers.public_allowed(uuid) to anon,authenticated;
create or replace function operations_helpers.profile_visible(p_user uuid,p_hidden boolean) returns boolean language sql stable security definer set search_path='' as $$
 select (not p_hidden and guardian_helpers.public_allowed(p_user)) or (auth.uid()=p_user and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)) or private.is_admin();
$$;
-- Explicitly update existing visibility helpers rather than changing block or
-- moderation state. This keeps a guardian withdrawal separate from sanctions.
do $patch$ declare signature text; definition text; begin
 foreach signature in array array[
 'author_profile_helpers.get_recipe_author(uuid)',
 'search_suggestion_helpers.get_search_suggestions(text)',
 'search_suggestion_helpers.search_ranked_users(text,integer)',
 'post_helpers.visible(uuid)',
 'blocking_helpers.recipe_accessible(uuid)',
 'blocking_helpers.get_block_state(uuid)',
 'comment_alert_helpers.visible(uuid)',
 'comment_alert_helpers.notify_comment()'
 ] loop
 select pg_get_functiondef(signature::regprocedure) into definition;
 definition:=replace(definition,'not p.moderation_hidden','not p.moderation_hidden and guardian_helpers.public_allowed(p.id)');
 definition:=replace(definition,'case when p.moderation_hidden and','case when (p.moderation_hidden or not guardian_helpers.public_allowed(p.id)) and');
 definition:=replace(definition,'not a.moderation_hidden','not a.moderation_hidden and guardian_helpers.public_allowed(a.id)');
 definition:=replace(definition,'not actor.moderation_hidden','not actor.moderation_hidden and guardian_helpers.public_allowed(actor.id)');
 definition:=replace(definition,'where id=p_user_id and moderation_hidden','where id=p_user_id and (moderation_hidden or not guardian_helpers.public_allowed(id))');
 definition:=replace(definition,'where r.id=p_recipe and not r.is_hidden','where r.id=p_recipe and not r.is_hidden and guardian_helpers.public_allowed(r.author_id)');
 execute definition;
 end loop;
end; $patch$;
create policy guardian_recipe_visibility on public.recipes as restrictive for select to anon,authenticated using(guardian_helpers.public_allowed(author_id) or author_id=auth.uid() or private.is_admin());
create policy guardian_comment_visibility on public.recipe_comments as restrictive for select to anon,authenticated using(guardian_helpers.public_allowed(user_id) or user_id=auth.uid() or private.is_admin());
create policy guardian_review_visibility on public.recipe_reviews as restrictive for select to anon,authenticated using(guardian_helpers.public_allowed(user_id) or user_id=auth.uid() or private.is_admin());
do $children$ declare relation text; begin
 foreach relation in array array['recipe_ingredients','recipe_steps','recipe_nutrition','recipe_tags'] loop
 execute format('create policy guardian_recipe_content_visibility on public.%I as restrictive for select to anon,authenticated using(blocking_helpers.recipe_accessible(recipe_id))',relation);
 end loop;
end; $children$;
create function guardian_helpers.guard_message_recipient() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not guardian_helpers.public_allowed(new.sender_id) or not guardian_helpers.public_allowed(new.recipient_id) then raise exception 'Guardian consent required before messaging' using errcode='42501'; end if;
 return new;
end; $$;
revoke all on function guardian_helpers.guard_message_recipient() from public,anon,authenticated;
create trigger guardian_message_recipient before insert on public.direct_messages for each row execute function guardian_helpers.guard_message_recipient();
-- Bump the existing visibility epoch for clients refreshing public data.
create function guardian_helpers.bump_visibility() returns trigger language plpgsql security definer set search_path='' as $$
begin update operations_helpers.visibility_epoch set version=gen_random_uuid() where singleton; return null; end; $$;
revoke all on function guardian_helpers.bump_visibility() from public,anon,authenticated;
create trigger guardian_request_visibility after insert or update or delete on guardian_helpers.requests for each statement execute function guardian_helpers.bump_visibility();
create trigger guardian_age_visibility after insert or update or delete on public.account_age_confirmations for each statement execute function guardian_helpers.bump_visibility();
notify pgrst,'reload schema';

-- Publish the revised texts without forging acceptance for existing accounts.
insert into public.content_policy_versions(version,terms,content_policy,active) values('2026-10-16.1','[{"title":"1. Using Pickle","body":"Pickle is operated by Taelim Auh, an individual based in the Republic of Korea. You must be at least 13 years old to activate or use a Pickle account. At age 13, activation requires explicit consent from an adult parent or legal guardian, reviewed by Pickle before account features are available. Guardian consent is tied to the displayed policy version; material updates can require renewed review. A guardian may withdraw consent or request deletion through admin@getpickleapp.com. A self-declaration is not proof of age or guardian authority. Follow any additional local consent requirements that apply to you. Public recipe browsing is separate from account activation and does not waive this account-age rule. Use Pickle in compliance with applicable law, these terms and the Content Policy. The Privacy Policy explains our data practices."},{"title":"2. Accounts","body":"Some features require an account. You are responsible for the accuracy of your account information and for keeping your login credentials secure. You are also responsible for activity that occurs through your account."},{"title":"3. Recipes and nutrition information","body":"Recipes, cooking times, substitutions, serving sizes, and nutrition values are provided for general informational purposes. Results can vary based on ingredients, equipment, brands, preparation methods, and individual circumstances. Use appropriate food-safety practices and your own judgment when cooking."},{"title":"4. User content","body":"You retain rights you hold in recipes, images, comments, reviews, profile information and messages you submit. You give Pickle a non-exclusive, worldwide, royalty-free permission to store, host, technically format, reproduce and display or deliver that content as needed to operate and secure the features you use. Public posts may be displayed/shared through public features. Private messages and drafts are processed for their private features and the limited safety/legal operations described in the Privacy Policy, rather than unrestricted public distribution. You must have the rights and permissions needed to share your content."},{"title":"5. Acceptable use","body":"Do not use Pickle to harass others, post illegal or harmful content, impersonate others, infringe intellectual-property rights, distribute malware, interfere with the service, scrape the service in an abusive manner, or attempt to access accounts or systems without authorization."},{"title":"6. Pickle content and intellectual property","body":"The Pickle name, branding, app design, software, and original content are protected by applicable intellectual-property laws. These terms do not transfer ownership of Pickle or its content to you."},{"title":"7. Suspension and termination","body":"We may apply warnings, content hiding/public removal, account restrictions or suspension according to the Content Policy and safety needs. That policy explains provisional actions, repeat incidents, approval of long/permanent suspensions, public reasons and appeals within 14 days. You may request account deletion, including deletion of your published recipes and uploaded photos. Deletion is attempted immediately; failed steps continue through a restricted background retry process. An accepted request is distinguished from completed deletion. Minimal deletion receipts and encrypted application backups expire after 30 days; detailed evidence and minimum enforcement history follow the 30/90-day rules and active-case/restriction exceptions in the Privacy Policy. Staff accounts require operator-assisted deletion. Provider copies have separate lifecycles."},{"title":"8. Service availability","body":"We work to keep Pickle available and reliable, but we do not guarantee uninterrupted or error-free operation. Features may change, be added, or be removed as the service develops."},{"title":"9. Disclaimer and limitation","body":"To the extent permitted by applicable law, Pickle is provided on an “as is” and “as available” basis. Pickle is not responsible for losses caused by reliance on recipe or nutrition information, service interruptions, or user-submitted content except where liability cannot legally be excluded."},{"title":"10. Changes to these terms","body":"We may update these terms as Pickle changes. When renewed agreement is required, you must accept the updated terms and Content Policy before sharing recipes, photos, comments, reviews or messages. The server records the accepted policy version and time. This agreement is not consent to unrelated marketing or all possible processing. Privacy notices and any separate purpose-specific consents must be handled according to their actual purpose and applicable rules."},{"title":"11. Contact","body":"For questions about these terms, contact Taelim Auh, the Pickle operator in the Republic of Korea, at admin@getpickleapp.com. Mandatory rights under applicable law are not excluded by these terms."}]'::jsonb,'[{"body":"Pickle accounts are for people aged 13 and over. Accounts declared age 13 require reviewed consent from an adult parent or legal guardian before activation. Under-13 accounts must not be activated. See the Privacy Policy for guardian requests, withdrawal and rights. This policy applies to recipes, photos, comments, reviews, profiles and messages. You must have permission to share your content. Honest low ratings, respectful criticism, different tastes and ordinary cooking failures are not policy violations.","title":"1. Content covered by this policy"},{"body":"Do not post harassment, threats, bullying, hateful discrimination or incitement to violence; sexual exploitation, explicit sexual content, non-consensual sexual images or child sexual abuse content; private identifying information or private conversations without permission; scams, phishing, spam or deceptive promotions; content that infringes another person''s rights or impersonates them; instructions that encourage harm, clearly dangerous cooking practices or unsupported promises to cure disease; manipulated reviews or engagement; or content or accounts intended to evade moderation.","title":"2. Prohibited content and behaviour"},{"body":"Pickle is operated by Taelim Auh, an individual based in the Republic of Korea. Report recipes, reviews, comments and users in the app, and block users when needed. Designated Pickle administrators review reports. The responsible Pickle operator reviews long or permanent suspensions and reversals. Reviewers must not handle cases in which they are the reported person or reporter. Contact admin@getpickleapp.com for additional information or questions.","title":"3. Reporting and responsibility"},{"body":"Reports are received, prioritised and grouped by incident. Reviewers consider the full context, relevant evidence, established previous violations and any additional information needed before deciding. Content may be provisionally hidden to prevent ongoing harm without confirming a violation. Urgent and high-priority cases have a 24-hour first-review target; ordinary reports have a 3-business-day target. These are operational goals, not guaranteed response times.","title":"4. Review process and response targets"},{"body":"Possible outcomes include no violation confirmed, requests for changes or information, provisional hiding, hiding, removal and restoration. Content removal means removal from the service''s public display; it is different from irreversible deletion of every stored record. A report or allegation alone does not establish infringement or unsafe conduct. Report count alone never determines a sanction.","title":"5. Content actions"},{"body":"A minor first confirmed incident normally receives a warning and an appropriate content action. Repeated confirmed incidents may lead to a 3-day restriction on publishing, photo uploads and messages, or a 7-day or 30-day suspension that also restricts social interactions. Critical risk may lead to a provisional 24-hour suspension and immediate content hiding while a long or permanent suspension is reviewed. Severe violations or proven repeated evasion may justify permanent suspension without prior warnings. Long and permanent suspensions require a separate final approval step. Suspended accounts may still view notices, report safety concerns, appeal, delete their own content and request account deletion.","title":"6. Account warnings and restrictions"},{"body":"Repeated violations are assessed using confirmed incidents within the preceding 90 days. Duplicate reports about the same incident count once; dismissed, provisional and overturned findings do not count. Restrictions expire at the stated end time; permanent suspension has no automatic end date. Proven malicious false reporting may lead to a warning or temporary reporting restriction. A report that is merely dismissed does not justify restricting the reporter.","title":"7. Repeat violations, expiry and false reports"},{"body":"Authors receive the affected content or account action, policy clause, public reason and any restriction duration through in-app notices and email. Reporter identity and internal administrator notes are not shared with the author. Reporters receive only a limited review result. You may appeal within 14 days of the decision notice through Profile > Account status & appeals. We aim to review appeals within 7 business days, using another uninvolved reviewer where available. If the decision was mistaken, its violation count and restriction are cancelled and content is restored unless another standing decision still applies.","title":"8. Notices, privacy and appeals"},{"body":"Review decisions, responsible administrators, reasons, times and appeal results are recorded for oversight. Detailed report snapshots, evidence and notes expire 30 days after case closure or final appeal review, whichever is later. Minimum enforcement history is retained for 90 days. Open cases/appeals and the minimum state needed to enforce an active restriction remain until resolved or the restriction ends. Account deletion immediately attempts removal of the account, published recipes and uploaded account/recipe/chat photos; the account''s public profile/content is hidden while failed steps retry automatically. The application keeps minimal deletion-processing records and an encrypted receipt backup for 30 days after successful deletion, without making a backup copy of recipe, message or photo content. Expired files are removed through the storage service; failed cleanup is retried and visible to the operator. Vendor-managed logs, mailbox copies and infrastructure backups have separate settings; this does not assert that those providers'' lifecycles have been changed to 30 days. Contact admin@getpickleapp.com for privacy/deletion assistance.","title":"9. Records and account deletion"}]'::jsonb,false);
update public.content_policy_versions set active=false where active;
update public.content_policy_versions set active=true where version='2026-10-16.1';
notify pgrst,'reload schema';
