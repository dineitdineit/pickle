# Pickle feature-gap review

Reviewed: October 19, 2026 (Asia/Seoul).

Scope: static review of current application source, Android configuration and implementation documents. No production records, provider dashboard settings or physical-device behavior were audited in this review. No application or database behavior was changed. Prior build/test results are not a substitute for the device checks below.

Later implementation update (October 19): post-comment/reply in-app alerts and exact-thread navigation from item 3 are implemented. October 20: cooking mode and Android push integration are implemented; Firebase server authentication passed, while live push delivery remains disabled pending signed-in device and two-account delivery tests. See `cooking-mode.md` and `android-push-delivery.md` for current verification limits. Findings below preserve the original review context.

## Overall assessment

October 20 saved-library update: saved-only server search, private Want to cook/Cooked states, direct recipe-detail fetching and cursor pagination are implemented. The home-catalogue dependency described below is resolved for Saved. See `saved-recipe-management.md` for tests and scope; the separate Liked screen still uses the home catalogue.

Pickle already has a substantial foundation: recipe publishing/editing, discovery/search, saving, unit conversion, profiles/follows, direct messages, recipe comments/replies and notifications, photo posts, original-recipe tagging and recipe-author recognition. Existing recipe/review/comment moderation, consent, blocking and account-deletion foundations should be reused.

The highest-priority gaps are incomplete integrations between those features. The core loop should be: discover a recipe → save it → cook it → share the result → receive a response → return.

## 1. Complete reporting and moderation for photo posts and post comments

Priority: P0 — address before public release of these interactions.

Evidence:
- `src/PhotoPostCard.tsx`: post options offer copy/share and owner deletion, but no report action.
- `src/PostComments.tsx`: comment/reply creation and owner deletion exist, without reporting.
- `src/ReportButton.tsx`: shared target types are recipe, review and user.
- `docs/photo-posts.md` explicitly records the missing photo-post comment moderation integration.
- `docs/direct-messages.md` records that individual-message reporting is not implemented. User-level reporting and blocking already exist; do not describe them as absent.

Minimum next increment: report a post or its comment/reply from that content; show its report and target context in the admin queue; support hide/restore or the established moderation actions; apply evidence retention, author notices, appeals and blocked/deleted-content rules consistently. Add a way to report an abusive conversation/message with appropriately scoped evidence rather than requesting unrestricted inbox access. Verify permissions with two user accounts and an administrator.

Google Play's UGC policy requires reporting/blocking and effective ongoing moderation. This is a launch-readiness gap, not a prediction about an individual store-review outcome: https://support.google.com/googleplay/android-developer/answer/9876937?hl=en

## 2. Finish Android authentication, links and Back navigation

2026-10-21 update: Native PKCE OAuth/confirmation/recovery callbacks, cold/warm
content intents, Android website Open in Pickle fallback and centralized Back
handling are implemented. 311 automated tests and emulator routing/Back checks
pass; the debug APK is rebuilt. Supabase redirect allowlisting, real Google and
recovery-email completion, and signed HTTPS domain association still need owner
configuration/acceptance. See [Android auth and links](native-android-auth-links.md).
The observations below describe the original review snapshot.

Priority: P0 — resolve/verify before external Android testing and release.

Evidence:
- `src/AuthScreen.tsx` redirects OAuth, email confirmation and password recovery to the web app URL.
- `android/app/src/main/AndroidManifest.xml` has the launcher intent, but no authentication/link VIEW intent filter.
- `MainActivity.java` is the default `BridgeActivity` subclass.
- No application `appUrlOpen` or `backButton` integration was found in `src`.
- `src/lib/share.ts` creates usable website links for recipes/posts; missing native opening does not mean sharing itself is absent.

Minimum increment: configure secure native auth callbacks and allowed redirects, complete session handling in the app, and handle both cold-start and already-running callbacks. Register/verify appropriate links so a shared recipe/post opens its destination in the installed app with a web fallback. Add Back/gesture handling for internal screens and unsaved work. Do not infer successful native Google login from successful website login.

Supabase's redirect/callback guidance: https://supabase.com/docs/guides/auth/native-mobile-deep-linking

Acceptance: Google login, confirmation and reset return to the app; session persists after restart; shared recipe/post opens correctly; Back closes dialogs/screens without unexpectedly losing a draft. This review did not reproduce a device failure; it identifies missing source integrations.

## 3. Complete conversation alerts and add optional phone push

Priority: P1 — important for returning to the community.

Existing recipe-comment, recipe-reply and tagged-photo alerts work in the in-app inbox. Keep them.

Evidence:
- `src/lib/notificationText.ts` and `src/SocialScreen.tsx` support recipe conversation and recipe-photo-post events, but not post-comment/post-reply events.
- `src/NotificationSettingsScreen.tsx` explicitly says its settings control in-app activity rather than phone push.
- No push delivery/token-registration integration was found in the app source; the Android manifest has no notification permission.

Minimum increment: alert a post owner about new comments and a commenter about replies, open the specific thread, respect preferences/blocks/content visibility and suppress duplicate/self alerts. Add opt-in device push for messages/replies with token rotation, sign-out cleanup, channel settings, visibility rechecks and safe lock-screen previews. Phone push is a separate delivery layer, not something the existing inbox setting already enables.

Android 13+ permission guidance: https://developer.android.com/develop/ui/compose/notifications/notification-permission

## 4. Add a practical Cook this → I cooked this flow

Priority: P1 — strongest new feature for the stated recipe-first direction.

Evidence:
- `src/RecipeSections.tsx` displays ingredients and steps and supports US/Metric conversion. It does not provide ingredient checkoffs, cooking progress, a keep-awake mode or running timers.
- `src/RecipeDetailScreen.tsx` displays the stored serving count; no serving-size scaling control was found.
- `src/RecipeTaggedPosts.tsx` shows existing results but returns nothing when empty; it has no action to create the first result.
- Post creation already has a recipe picker. Reuse it instead of creating another photo-feedback system.

Small first version: Cook this opens a readable step view with ingredient checkoffs, progress/resume and optional screen-awake behavior. At completion, I cooked this opens the existing post composer with this recipe preselected. Put the same action on the recipe page even when there are no tagged posts yet. Add timers and sensible serving scaling next, preserving nonnumeric/free-text quantities and avoiding blind scaling of instruction text.

## 5. Make saved recipes useful for later cooking

Priority: P1 — finish the existing save promise before adding many new discovery surfaces.

Evidence: `src/SavedScreen.tsx` gets saved IDs and resolves them against the recipe catalogue passed into the screen. It has no saved-only search or planned/cooked states. `src/App.tsx` loads catalogue rows for home rather than fetching saved details independently.

Minimum increment: retrieve/paginate the user's actual saved recipe details directly, independent of home results; add saved-only search and two optional states, Want to cook and Cooked. Offer a simple route back to a planned recipe from Home. Collections and an ingredient shopping list can follow observed demand. Offline recipe downloads are a later enhancement, not an existing guarantee.

Potential correctness issue: saves can be omitted from the screen if their recipes are outside the catalogue rows returned to Home. The current backend row cap and whether users already encounter this were not checked.

## 6. Let following change what people see

Priority: P1 after the foundation; start with a simple feed.

Evidence: `src/lib/postFeed.ts` filters by author/recipe/post and orders by publication time. There is no followed-author feed option; `src/App.tsx` requests the global four-post home section. Follows/profile bells are implemented, but the content feed does not use the follow relationship.

Minimum increment: For you/Following, or one Following section showing followed cooks' visible recipes and posts. Use chronological ordering first; retain discovery content when someone follows nobody. Apply blocks, moderation and eligibility before pagination. Advanced AI ranking is unnecessary for this first step.

## 7. Protect post creation from interruption

Priority: P1 for reliable creator testing.

Evidence: `src/PostComposer.tsx` holds selected files, edits, caption and selected recipe in React state. Server upload drafts and retry acknowledgements exist, but they do not constitute a resumable composer. `docs/photo-posts.md` records that selected photos/edits are lost when the composer closes.

Minimum increment: a clear discard confirmation and recoverable local drafts for photos, edits, caption and recipe tag; offer Resume/Discard on return. Bound storage and retention, isolate drafts per account, remove them on sign-out/account deletion as appropriate, and explain limitations when Android removes local files. Test camera switching, process termination, low storage and a failed/retried upload.

## 8. Measure completion and return, not just popularity

Priority: P2 — prepare during a small beta, before sophisticated personalization.

Evidence: `src/AdminAnalytics.tsx` focuses on views, searches, saves and likes. No dashboard for cooking completion, save-to-cook conversion, post-reply response or cohort retention was found.

Minimum increment: answer whether new users save a recipe, return to it, share a result and receive a response; track next-week return, failed publishes and first-response time. Derive metrics from existing records where possible and collect only additional events that are needed. Avoid storing full message/comment bodies in analytics. Reconcile retention and disclosures before adding external analytics/error services.

## Additional technical finding: scalable recipe retrieval

`src/SearchScreen.tsx` fetches recipes with ingredients/tags and filters them on the client. Visible-result slicing is not server pagination. As the catalogue grows, this can slow search and omit recipes beyond the API's returned dataset. Add server-side matching/ranking and pagination; do not assume a particular live row limit without checking configuration. Address saved-item retrieval alongside this work.

## Defer for now

- Waraeat/stories: the disabled placeholder is deliberate; it is not a current launch-critical feature.
- General post likes, caption editing and profile sharing: useful polish, lower priority than safety and a completed conversation loop.
- Complex recommendations, restaurant discovery, payments and monetization: preserve the current recipe/community focus.

## Suggested sequence

1. Photo-post/comment reporting and moderation; native login/recovery/links/Back. Verify DM abuse reporting scope.
2. Post conversation alerts and optional phone push; protect unfinished posts.
3. Cook this/I cooked this; reliable saved retrieval and simple planned/cooked states.
4. Following feed, beta retention metrics and server-side catalogue search.

Before launch, separately rebuild the release checklist: `docs/google-play-release-checklist.md` is currently an empty file. Its existence does not establish that store-signing, policy declarations, audience settings, listing material or required testing are ready. Current Play Console/account state was not inspected here. Existing implementation notes contain historical TODOs and should not be treated as current without source/device verification.

### Follow-up: recoverable post drafts implemented (2026-10-20)

The original draft-loss finding above is resolved by account-scoped IndexedDB photo drafts, Resume/Discard, lifecycle saving, quota/conflict handling and stable-ID interrupted-share recovery. See docs/post-drafts.md for scope and limitations. No cross-device draft synchronization is provided.


### Follow-up: post/comment and selected-message reporting (2026-10-20)

Added Report actions for photo posts, post comments/replies and received messages, using the existing admin case workflow, moderation flags, author in-app notices/email jobs and reversals. Message evidence is limited to the selected message/photo. See docs/post-message-reporting.md for verification and access/retention boundaries.

