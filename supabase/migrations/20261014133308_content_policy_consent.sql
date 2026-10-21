create schema consent_helpers;
revoke all on schema consent_helpers from public,anon,authenticated;
grant usage on schema consent_helpers to authenticated;
create table public.content_policy_versions(
 version text primary key,
 terms jsonb not null check(jsonb_typeof(terms)='array'),
 content_policy jsonb not null check(jsonb_typeof(content_policy)='array'),
 active boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index content_policy_one_active on public.content_policy_versions(active) where active;
alter table public.content_policy_versions enable row level security;
revoke all on public.content_policy_versions from public,anon,authenticated;
grant select on public.content_policy_versions to anon,authenticated;
create policy published_policy_read on public.content_policy_versions for select to anon,authenticated using(true);
insert into public.content_policy_versions(version,terms,content_policy,active) values('2026-10-14','[{"title":"1. Using Pickle","body":"By accessing or using Pickle, you agree to these Terms of Service. If you do not agree, do not use the service. You must use Pickle in compliance with applicable laws and these terms."},{"title":"2. Accounts","body":"Some features require an account. You are responsible for the accuracy of your account information and for keeping your login credentials secure. You are also responsible for activity that occurs through your account."},{"title":"3. Recipes and nutrition information","body":"Recipes, cooking times, substitutions, serving sizes, and nutrition values are provided for general informational purposes. Results can vary based on ingredients, equipment, brands, preparation methods, and individual circumstances. Use appropriate food-safety practices and your own judgment when cooking."},{"title":"4. User content","body":"You retain ownership of content you submit to Pickle, such as comments and profile information. By posting content, you give Pickle a non-exclusive, worldwide, royalty-free license to host, display, reproduce, and distribute that content as needed to operate and improve the service. You must have the right to post any content you submit."},{"title":"5. Acceptable use","body":"Do not use Pickle to harass others, post illegal or harmful content, impersonate others, infringe intellectual-property rights, distribute malware, interfere with the service, scrape the service in an abusive manner, or attempt to access accounts or systems without authorization."},{"title":"6. Pickle content and intellectual property","body":"The Pickle name, branding, app design, software, and original content are protected by applicable intellectual-property laws. These terms do not transfer ownership of Pickle or its content to you."},{"title":"7. Suspension and termination","body":"We may restrict or suspend access when reasonably necessary to protect Pickle, our users, or third parties, or when these terms are violated. You may stop using Pickle at any time."},{"title":"8. Service availability","body":"We work to keep Pickle available and reliable, but we do not guarantee uninterrupted or error-free operation. Features may change, be added, or be removed as the service develops."},{"title":"9. Disclaimer and limitation","body":"To the extent permitted by applicable law, Pickle is provided on an “as is” and “as available” basis. Pickle is not responsible for losses caused by reliance on recipe or nutrition information, service interruptions, or user-submitted content except where liability cannot legally be excluded."},{"title":"10. Changes to these terms","body":"We may update these Terms of Service as Pickle changes. When renewed agreement is required, you must accept the updated terms and content policy before publishing or editing recipes, comments or reviews."},{"title":"11. Contact","body":"If you have questions about these terms, use the Contact Us section in your Pickle profile."}]'::jsonb,'[{"title":"1. Share content you have permission to use","body":"Post recipes, photos, comments and reviews that you created or have permission to share. Do not copy other people''s work or impersonate another person."},{"title":"2. Treat people respectfully","body":"No harassment, threats, bullying, hate speech, discrimination or abusive content. Do not target people with unwanted or harmful interactions."},{"title":"3. Keep content safe and lawful","body":"Do not post illegal content, sexual exploitation, explicit sexual content, graphic violence or instructions that encourage harm. Follow safe food handling practices and avoid dangerous or misleading cooking and health claims."},{"title":"4. Protect privacy","body":"Do not share someone else''s private contact details, addresses, identifying information or private messages without permission."},{"title":"5. Keep posts relevant and honest","body":"No spam, scams, deceptive promotions or manipulated reviews. Recipes, comments and reviews should be relevant to cooking and the content being discussed."},{"title":"6. Reports and moderation","body":"You can report recipes, comments, reviews and users, and block other users. Pickle may review reports and hide or remove content that violates this policy. Authors receive a moderation notice explaining the action and reason. Use Contact Us in your profile if you believe an action was mistaken."}]'::jsonb,true);
create table public.user_content_consents(
 user_id uuid not null references public.profiles(id) on delete cascade,
 policy_version text not null references public.content_policy_versions(version),
 accepted_at timestamptz not null default now(),
 primary key(user_id,policy_version)
);
alter table public.user_content_consents enable row level security;
revoke all on public.user_content_consents from public,anon,authenticated;
grant select on public.user_content_consents to authenticated;
create policy own_content_consent on public.user_content_consents for select to authenticated
 using(user_id=(select auth.uid()) and not coalesce((select (auth.jwt()->>'is_anonymous')::boolean),false));

create function consent_helpers.state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to agree to content policies' using errcode='42501'; end if;
 select jsonb_build_object('user_id',uid,'version',p.version,'terms',p.terms,'content_policy',p.content_policy,
 'accepted',exists(select 1 from public.user_content_consents c where c.user_id=uid and c.policy_version=p.version))
 into result from public.content_policy_versions p where p.active;
 if result is null then raise exception 'Content policy unavailable' using errcode='55000'; end if;
 return result;
end; $$;
revoke all on function consent_helpers.state() from public,anon,authenticated;
grant execute on function consent_helpers.state() to authenticated;
create function public.get_content_policy_state() returns jsonb language sql stable security invoker set search_path='' as $$ select consent_helpers.state(); $$;
revoke all on function public.get_content_policy_state() from public,anon,authenticated;
grant execute on function public.get_content_policy_state() to authenticated;

create function consent_helpers.accept(p_version text,p_terms_accepted boolean,p_content_accepted boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); current_version text;
begin
 if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in to agree to content policies' using errcode='42501'; end if;
 if p_terms_accepted is distinct from true or p_content_accepted is distinct from true then raise exception 'Agree to both policies' using errcode='22023'; end if;
 select version into current_version from public.content_policy_versions where active for share;
 if current_version is null or p_version is distinct from current_version then raise exception 'Policy changed. Review the current version.' using errcode='40001'; end if;
 insert into public.user_content_consents(user_id,policy_version) values(uid,current_version) on conflict do nothing;
 return consent_helpers.state();
end; $$;
revoke all on function consent_helpers.accept(text,boolean,boolean) from public,anon,authenticated;
grant execute on function consent_helpers.accept(text,boolean,boolean) to authenticated;
create function public.accept_content_policy(p_version text,p_terms_accepted boolean,p_content_accepted boolean) returns jsonb language sql security invoker set search_path='' as $$ select consent_helpers.accept(p_version,p_terms_accepted,p_content_accepted); $$;
revoke all on function public.accept_content_policy(text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.accept_content_policy(text,boolean,boolean) to authenticated;

create function consent_helpers.guard_content() returns trigger
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); current_version text; owner_id uuid;
begin
 -- Seed data and service jobs without a user session are trusted server work.
 if uid is null then return new; end if;
 if tg_table_name='recipe_submissions' then
  if new.status<>'published' then return new; end if;
  owner_id:=new.user_id;
 elsif tg_table_name='recipes' then owner_id:=new.author_id;
 else
  owner_id:=new.user_id;
  if tg_op='UPDATE' then
   -- Administrative sanction updates are not new user content.
   if new.content is not distinct from old.content then
    if tg_table_name='recipe_comments' then return new; end if;
    if new.rating is not distinct from old.rating then return new; end if;
   end if;
  end if;
 end if;
 if owner_id is distinct from uid or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Authenticated content author required' using errcode='42501'; end if;
 select version into current_version from public.content_policy_versions where active for share;
 if current_version is null or not exists(select 1 from public.user_content_consents where user_id=uid and policy_version=current_version) then
  raise exception 'CONTENT_POLICY_CONSENT_REQUIRED' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function consent_helpers.guard_content() from public,anon,authenticated;
create trigger content_consent_comment before insert or update on public.recipe_comments for each row execute function consent_helpers.guard_content();
create trigger content_consent_review before insert or update on public.recipe_reviews for each row execute function consent_helpers.guard_content();
create trigger content_consent_recipe before insert on public.recipes for each row execute function consent_helpers.guard_content();
create trigger content_consent_submission before insert or update on public.recipe_submissions for each row execute function consent_helpers.guard_content();

