# Content policy agreement

Current agreement version: 2026-10-15.3 (retention policy). Prior acceptance is not silently migrated.

2026-10-15 update: Current agreement version is 2026-10-15.2. Accounts must complete the 18+ self-declaration check; existing acceptance/age records are not automatically created. Prior-feature rollback SQL fixtures need an account_age_confirmations fixture in addition to consent. See docs/legal/ for current text and retention proposals.

Recipe photos, avatars, direct messages and chat photos are also guarded by the current agreement, on both client and server.

Before a signed-in, non-anonymous user uploads a recipe photo, publishes/edits a recipe, posts/edits a comment or reply, or submits/edits a rating/review, the app checks the current server policy version. Rating-only reviews are included. Private text drafts can still be saved without agreement; deleting existing content, reporting and administrative moderation remain available.

The **Before you share** modal displays complete Terms of Service and Content Policy documents and their version. Two unchecked checkboxes must both be selected before **Agree and continue** becomes available. Cancel preserves the recipe/comment/review text and performs no content write. Successful agreement resumes the user's pending action. Failed policy reads or unconfirmed acceptance do not proceed. Changing accounts closes the modal; a different account never inherits consent.

The current version is **2026-10-15** (initial version: 2026-10-14). See [moderation operations](moderation-operations.md) for the published procedures and sanction criteria. It uses the existing app terms with an explicit renewal clause. Content rules cover permission to share, harassment/hate, unsafe or illegal content, privacy, spam/deceptive reviews, reporting and moderation. This addresses the pre-creation agreement portion of [Google Play's UGC policy](https://support.google.com/googleplay/android-developer/answer/9876937); it is not a determination that all store release requirements are complete.

## Server enforcement

- `content_policy_versions` stores the immutable full text for each version. Public SELECT is intentional; clients cannot edit policies. A partial unique index allows only one active version. Text/version/creation time cannot be edited in place, including after acceptance.
- `user_content_consents` records account ID, policy version and server acceptance time. A row represents explicit acceptance of both documents, as required by the acceptance RPC. Account deletion cascades to consent records. Users may SELECT only their own records; no direct client inserts, updates or deletes are granted.
- `get_content_policy_state` and `accept_content_policy` are authenticated invoker RPCs with guarded implementations in the unexposed `consent_helpers` schema. Acceptance derives the user from the verified session, rejects partial/null choices and old versions, and is idempotent without changing the original acceptance timestamp.
- Database triggers enforce agreement on new comments/reviews, content edits and published submissions/recipes, including owner-management RPCs that use privileged helpers. Administrative moderation-only changes do not count as user edits. Existing content is not removed and existing users are not automatically marked as having agreed.
- A restrictive Storage INSERT policy requires current agreement for `community_recipe_images`. Avatar and chat photo policies are unchanged.
- Active-policy rows are locked while recording consent or checking a content write. If the policy changes after the modal opens, the old acceptance is rejected; cancel and retry to review the current text. If it changes after acceptance but before publication, the server rejects publication and retains the editor's text.

## Updating policy text

Create a **new** version with the full terms and content policy. In a single server migration transaction, deactivate the old version and activate the new one. Never overwrite accepted text or forge user consent. Existing accounts will see the modal before their next guarded operation. Keep previous versions and their acceptance records for audit. Update the profile's static Terms of Service text if the terms themselves change.

The old Android bundle does not contain the agreement modal; its guarded content writes fail until the updated bundle is installed. Run `npm run android:sync` and **Run ▶** in Android Studio for local testing.

## Verification

`tests/content-consent.integration.sql` runs within BEGIN / ROLLBACK. It verifies complete server documents, explicit dual acceptance, partial/old/forged rejection, private and idempotent records, account/anonymous isolation, unagreed comments/ratings/photo uploads/publication, private draft saving, successful publication after acceptance, edits after policy rotation, and deletion without renewed agreement. Storage fixtures are metadata only; no image bytes or real email messages are sent.

`tests/content-consent.test.mjs` checks unchecked/disabled modal defaults, confirmed account/version responses, error handling, no local acceptance cache, duplicate requests sharing one modal, and cancellation retaining comments/replies. Recipe and review tests also check cancellation without publication or form reset.

The consent suite and the existing block, moderation and recipe-owner suites passed on 2026-10-14 with rollback. For prior-feature integration suites, fixture agreement is inserted only inside the rollback transaction before running the suite; this avoids confusing the new consent requirement with their unrelated assertions. No real account is silently enrolled.

Manual Android check: on an account without consent, try a photo upload or comment/rating; inspect both documents; cancel and verify retained input; repeat and agree; verify the original action completes and the modal is not repeated for the same version. Confirm another account/device uses its own server agreement. A controlled new policy version should require agreement again. Store readiness and actual device acceptance remain separate checks.
