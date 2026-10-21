# Following feed and cooking retention metrics

Implemented 2026-10-20. Home has Discover / Following, on Android and desktop. Following mixes published recipes and photo posts by followed cooks, newest first. It has sign-in, empty, initial-failure and retryable pagination states. Existing recipe details, profiles, post comments and original-recipe links remain usable.

## Access and pagination

`following_feed` uses caller RLS, joins the caller's follows in the database and applies hidden/removed, profile, guardian, deletion and block restrictions. No client-side list of cook IDs or home-catalogue dependency. Keyset pagination uses publication time, kind and UUID with 12 items plus one lookahead; kind prevents ambiguity when the two tables contain the same UUID. Tags are loaded in one bounded batch for photo posts. Safety events reload the feed; returning from a profile remounts it with current follows. Account-keyed mounting prevents another account's stale feed from flashing.

## Admin analytics: 7 / 30 days

- **Saved-recipe return rate:** distinct still-saved account/recipe/save-time pairs created within the window before today UTC; numerator is those pairs opened again on a later UTC day. Unsaving removes the pair from this cohort. An open can originate from any route, but requires a successfully loaded recipe and the caller's existing save.
- **Returning savers:** distinct people with a later-day saved open in the window, including older saves outside the return-rate cohort.
- **Marked Cooked:** distinct people transitioning an existing save to Cooked in the window. This is self-reported, not proof of cooking. No historical backfill.
- **Result posts / publishers:** currently available published posts in the window tagging another cook's recipe. Own-recipe tags, hidden/removed/deleting/ineligible content and blocked original-author/result-author pairs are excluded.
- **Results receiving responses:** that result-post cohort with an available other-cook comment/reply or original-author heart. **Original-author responses** narrows this to the tagged recipe author's comment/reply or heart. A response may arrive after publication day. Deleted, hidden or recipient-blocked responses do not count. These measure available in-app interactions, not push/email delivery or read receipts.

Empty denominators display —. Returns/Cooked instrumentation starts with this version; older post/response records can contribute to their publication-window cohorts. These are feature-use measures, not D1/D7 whole-app retention or causal attribution to the Following feed.

## Data and safety

`engagement_helpers.saved_activity` is private, RLS enabled without client policies and with no table grants to client roles. It stores account/recipe IDs, original save timestamp, UTC day, kind and server timestamp only; one event per account/recipe/kind/day. The public return recorder accepts only a recipe ID and validates the caller, age/account status, existing later-day save and current recipe access. Cooked transitions are recorded by a database trigger. Reporting helpers are outside the exposed API schema, with explicit current-admin checks; public RPC wrappers use invoker privileges. No new third-party analytics SDK or provider.

Raw activity expires in 30 days and is purged hourly by `pickle-engagement-expiry`; account/recipe deletion cascades. Aggregate reports are computed on demand rather than archived. Existing posts/comments/reactions follow their existing deletion and retention rules. Privacy copy is updated in the app and legal text files.

## Verification

`tests/following-retention.integration.sql`: rolled-back synthetic users/content; mixed feed ordering, tied-time pagination, lookahead, hidden/blocked/unfollowed exclusions, guest/admin permissions, later-day/same-day/unsaved validation, deduplication, exact cohort counts, response deletion/block visibility and account-deletion cascade. No test fixture is committed and no queued notice is dispatchable outside its transaction.

`tests/following-feed.test.mjs`: bounded client query, microsecond cursor preservation, tag batching, duplicate merging, failure handling, tabs/guest UI and zero-denominator formatting.

### Results

298 automated tests passed, and the rolled-back SQL integration suite passed. Security advisors reported no new exposed privileged-function warning; the private RLS table intentionally has no client policies. The hourly expiry job is active and no synthetic fixture profiles remain. On Pixel 7 / API 36, the new Home tabs and authenticated Following no-updates state loaded through the real database RPC. The emulator stopped before screenshot/navigation follow-up; populated-feed rendering and recipe/post action wiring were checked in component tests, and populated mixed-content pagination was checked in SQL. No real user was followed and no public content was posted for this check. The debug APK was rebuilt; no web/store release was deployed.

