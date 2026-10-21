# User blocking

Another user's profile → three-line **User options** → **Block / Unblock** or red **Report**. Own profile → menu → **Settings → Privacy → Blocked users** provides an owner-only list and unblocking.

## Rules applied on 2026-10-14

| Area | While either account blocks the other | After both unblock |
| --- | --- | --- |
| Recipes | Mutually hidden in home, browse, search, recommendations and profiles. Direct recipe and child-content queries are restricted too. | Visible again if still published and not moderated. |
| Profiles | Only avatar, name, handle and safety options. No bio, counts, recipe search, recipes, follow, bell or message controls. Reverse restrictions show generic unavailability. | Full public profile restored. |
| Saves and likes | Hidden for inaccessible recipes. New saves/likes of the other account's recipes or comments are rejected. | Retained records appear again; they are never automatically deleted by blocking. |
| Comments and reviews | Each other's text is hidden, including on unrelated recipes. No new comments/reviews on each other's recipes, or replies/likes to each other's comments. | Retained text appears again if not moderated. |
| Ratings and views | Personal blocks do not change global totals or rating distribution for accessible recipes. Review pagination uses visible rows separately from aggregate totals. | Unchanged. |
| Follows and alerts | Both follows and their recipe-alert subscriptions are removed. No new follows or recipe alerts. | Must follow and enable alerts manually; nothing is restored automatically. |
| Messages | Sending is rejected both ways. Conversations and unread counts are hidden, including photo access through Storage policies. | Retained conversations become accessible again. |
| Social notifications | Old follow/new-recipe notices are hidden. New notices between the pair are suppressed. | Retained old notices become visible again. |
| Moderation and safety | Reports remain available. Administrative review, audit history and sanction notices/emails remain available regardless of personal blocks. | Unchanged. |

Blocking sends no notification to the other user. Users may only remove their own blocks; contact/content remain restricted until both directions are removed. Blocking yourself or using an anonymous account is rejected.

These are account restrictions for signed-in users, not removal of public content. Signed-out visitors can still access published public recipes. Public image URLs and already downloaded data cannot be revoked by a personal block. Already issued private chat image URLs expire within five minutes; new signing requests fail while blocked.

The older implementation deleted social notices when blocking. Notices already deleted by that implementation cannot be recovered. Blocks created from this version retain notices instead.

## Enforcement and refresh

`public.user_blocks` has owner-only SELECT RLS and no direct client write grants. Authenticated invoker RPCs delegate to restricted, unexposed `blocking_helpers` functions. Viewer-scoped helpers avoid recursive RLS; no helper exposes someone else's block list. Full profile reads, recipe child tables, reviews, comments, saved recipes, likes and messages have restrictive policies. Insert/update guards serialize interactions with blocking using canonical pair locks. Notifications have an independent producer guard, so even trusted background inserts cannot create social notices for blocked pairs.

Author summaries return only identity for a restricted account. Privileged popular-recipe and ranked-user search helpers explicitly filter blocks. The rating helper exposes bounded aggregates only for accessible published recipes, including active reviews hidden by a personal block. Admin moderation helpers keep their existing role/non-anonymous checks and bypass personal content filters only within administrative processing.

The client refreshes after local block changes, account changes and returning to the foreground. While visible, it polls an opaque viewer-scoped change token every 30 seconds and reloads affected data only when blocks change. Chat checks every 15 seconds. Server restrictions apply to subsequent requests immediately across devices; cached screens update on refresh or the next successful poll. Network failures do not turn a failed write into success.

## Verification

Run SQL suites inside **BEGIN / ROLLBACK**; never retain fixtures or send live emails:

- `tests/blocked-content.integration.sql`: bilateral recipe/child/profile hiding, identity-only profile/block list, user-search filtering, unchanged rating aggregates, retained saves/likes/notices, comment/review/reply/like/save denial, unrelated allowed interactions, report availability, new-notice suppression, opaque change token, mutual unblock and guest access.
- `tests/blocking.integration.sql`: private lists, forged writes, bilateral follow/message restrictions, retained conversations, mutual blocks, no refollow, self/anonymous rejection.
- `tests/content-reports.integration.sql`: admin processing even when the administrator blocks the author, hide/restore, dismissal, notes, audit and stale-action rejection.
- `tests/chat-photos.integration.sql`: private photo access, blocked/anonymous/outsider denial, immutable paths and idempotent photo delivery.

All four suites passed on the connected project on 2026-10-14 with rollback. Client tests include restricted-profile rendering, confirmed block/unblock replies, duplicate writes and late responses. Formatting, TypeScript and web build are checked before Android synchronization.

Android: `npm run android:sync`, then **Run ▶** in Android Studio. Use two controlled accounts: save/like a recipe, follow with alerts and exchange a message; block; check all four areas and report availability; then unblock both accounts and verify records return but follows/alerts stay off. Check the second account/device after returning to the app or waiting 30 seconds. Device interaction remains a manual acceptance check.
