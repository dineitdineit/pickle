# Photo posts — first implementation

Implemented on `capacitor-android-bootstrap`, 2026-10-16. No web production
deployment, store release or production-branch merge is included.

## Flow

`+` → `Post` → gallery / Camera → Next → edit each photo → Next → caption → Share.
The gallery is requested on entry, with a Select photos button if the platform
requires another tap. Android uses its native file picker and external camera
app through Capacitor's existing WebChromeClient. The camera intent is declared
in manifest package queries; no broad photo-library or CAMERA permission is added.
On desktop, a browser may open a file chooser for the Camera button.

- 1–10 photos per post; JPEG, PNG and WebP, at most 5 MB and 40 megapixels each.
- Reorder/remove photos; edits remain attached to the photo, not its position.
- Original, Warm, Cool, Vivid, Mono and Vintage filters.
- Drag/resize crop, rotate, tilt, brightness, contrast, sharpness, temperature,
  saturation, highlights, shadows and vignette. Reset restores the selected photo.
- Text overlay, color, size and drag/slider positioning. At most 120 characters,
  wrapped to five lines. Preview and exported image use the same renderer.
- Caption up to 2,200 characters. Photos are decoded and re-encoded without source
  EXIF/XMP/IPTC, resized to a maximum 2,400 pixels on the long side, and exported
  with the edits baked in.
- Share opens the persisted post. Profile → Posts reloads published posts;
  swipe between photos. Owners can delete with confirmation.
  The profile's Posts count includes visible recipes and photo posts.

Selections/edits stay in memory while navigating between composer steps and on
upload failure. They are discarded on cancellation, app closure or page reload;
this first version does not implement a recoverable local post draft.

## Discovery and viewing UI

- Home keeps its recipe collections and adds **From kitchens** between Under
  30min and Party Packs. Up to four recent public posts appear as a compact
  horizontal strip on mobile and four columns on desktop, with photo, author
  and a stacked-photo badge. Empty/loading/error states have usable actions.
- **See all** opens a latest-first feed. Profile **Recipes / Posts** buttons
  switch between the existing recipe sections and a three-column photo grid.
  Opening and closing a post preserves the profile tab and loaded grid.
- Feed/detail cards show author identity, full-ratio photos inside a bounded
  frame, swipe/arrow/dot navigation for multi-photo posts, a two-line caption
  with More/Less, date and Share. Author-profile navigation preserves the feed's
  loaded pages, photo selection, expanded captions and scroll position.
- The **⋯** menu provides Copy link and, for the owner, Delete post. Deletion
  requires a separate confirmation panel and a verified server acknowledgement.
- Sharing uses the platform share UI, clipboard or a visible copy field. The
  frontend accepts `?post=<uuid>` links. The canonical `getpickleapp.com` links
  require this frontend to be deployed on the web; this task does not deploy it
  or configure Android App Links.
- Global discovery reads at most 21 rows per page, with a publish-time/UUID
  cursor retaining PostgreSQL microseconds. Home requests five rows to display
  four. Profile pages request 19 to display 18. Draft/hidden rows are excluded
  from discovery, including for owners/admins; blocked/hidden-author visibility
  still follows server RLS. Direct owner links can show a hidden-post notice.
- `20261016052914_photo_post_discovery_index.sql` adds a partial index for the
  global publish-time/UUID ordering, without changing access permissions.

## Server and media

Migration `20261016025934_photo_posts.sql` adds `photo_posts`, `post_photos` and
private `post_helpers`. Public tables permit only RLS-filtered SELECT; all writes
use RPCs with account eligibility, current content-consent and ownership checks.

`ensure_post_draft` reserves a client UUID. `publish_photo_post` validates 1–10
distinct uploaded paths in that account/post folder and publishes atomically.
The same UUID recovers a lost publish response without creating a duplicate.
Hash-based immutable photo filenames support upload retries and changed edits.
The client never reports success from an unconfirmed publish response.

Images use the existing **private** `community_recipe_images` bucket, with a
`community:` reference. Short-lived signed URLs follow post visibility and blocks;
already issued/cached URLs may remain usable until expiry. Unpublished drafts
remain private. Author moderation hiding and pending account deletion hide posts.
Account deletion cascades the rows and uses the existing account-folder cleanup.
Owner deletion queues unused image deletion through the existing leased/retrying
media worker. Abandoned uploads and empty drafts are eligible for cleanup after
seven days. Cancellation only queues unreferenced uploads and cannot delete a
post whose successful response was lost.

This increment adds uploading/viewing/owner deletion. Post-specific likes,
comments, discovery ranking, reports/administrator decisions and corresponding
moderation notices are separate follow-up work. Existing recipe/review/comment
report workflows do not yet accept a photo-post target. Complete post reporting
and moderation before a public/store release of this new content type.

## Verification

- `tests/photo-posts.test.mjs`: pixel edits, rotation, bitmap cleanup, immutable
  ordered uploads, upload failure, acknowledgement validation and safe retries.
- `tests/photo-posts.integration.sql`: synthetic identities/Storage metadata in a
  rolled-back transaction. Consent/age, direct-write denial, path ownership,
  atomic failure, order/idempotency, public/draft RLS, blocks, hiding and deletion
  queue checked against the deployed database. No user photos/posts created.
- Browser: two generated local images selected, filter/crop/brightness/text
  applied, order changed, caption entered and final preview inspected at a
  390-pixel content width. No real account or public publish used for this check.
- Full automated suite and Android sync/debug build checked; camera capture and
  the complete real-device upload flow still need a device/emulator smoke test.
- Discovery verification: 179 automated tests passed, including bounded/scoped
  reads, microsecond pagination, failed-page recovery, late-account response
  guards, sharing fallbacks and confirmed owner deletion. Synthetic discovery
  fixtures in `tests/post-discovery.integration.sql` passed in a rolled-back
  transaction against the deployed DB. Browser checks used four generated local
  photos to exercise the home/feed/profile/detail paths, caption expansion,
  multi-photo navigation, cancellation of deletion and dark mode. The real app
  also loaded its empty public post feed from Supabase without console errors.

## Android smoke test

After the latest Android sync, press Run in Android Studio. Use a signed-in adult
test account with current policy agreement. Choose two gallery photos, open
Camera for a third, edit/reorder, add caption and Share. Reopen Profile → Posts
and check the order, caption, crop/text/filter results. Verify a failed
upload keeps the composer, a retry creates one post, another account cannot see a
private draft, blocking hides published content, and owner deletion removes it.

## Recipe tags and photo feedback — 2026-10-16

The caption step now offers **Tag a recipe**. Users can search visible recipes by title, select one original recipe, change it or remove it before Share. The tag is optional, one per post, and is published atomically with the post. A missing, hidden, removed, blocked, guardian-ineligible or deleting author/recipe cannot be tagged. Existing untagged uploads use the unchanged publication endpoint.

Home/profile thumbnails show a small tag icon and the visible original-recipe title. Published cards show **Tagged recipe**, a thumbnail, title and original cook. Tapping opens that recipe using app navigation. Tag data is loaded once per feed page in a bounded batch with caller RLS; unavailable tags have no placeholder title or author snapshot. Recipe deletion removes the link and related notification while leaving the photo post intact. Post deletion removes the notice; private media cleanup is unchanged.

The original recipe author receives a `recipe_photo_post` in-app notification, which opens the exact photo post. No self-notice, email or device push is sent. Notifications honor the global activity and **Recipe comments & photo feedback** setting, suppress blocked/hidden/deleting content and expire after 30 days. A unique post/recipient index plus immutable/idempotent publication prevents duplicate notices. Unblocking does not backfill suppressed notices.

The original recipe author can leave/remove one heart on the photo feedback; others see **Liked by recipe author** after it is saved. This is an author acknowledgement, not a star rating or general post-like/comment feature. The server checks the live recipe owner and block/content/account restrictions. Reactions do not generate a second notification in this increment. Direct table writes remain revoked.

`20261016084920_post_recipe_tags.sql` is applied. `tests/post-recipe-tags.integration.sql` passed using temporary synthetic identities and Storage metadata inside BEGIN/ROLLBACK. It covers hidden/blocked search, atomic failures, immutable tags, replayed publication, creator-only reactions, duplicate prevention, notification preferences and deletion cleanup. No actual user posts, emails or photo files were created. `tests/post-recipe-tags.test.mjs` and updated upload/feed tests cover batching, acknowledgements, picker/card rendering, late responses and tagged upload routing. A real two-account mobile test remains necessary.

## Tagged photo posts on the recipe page — 2026-10-16

Recipe detail places **Made this recipe** between Comments and More recipes. It uses the existing post tiles (photo, multi-photo badge, original-recipe tag and author), in a three-column grid with up to six recent posts. **See all** opens a recipe-scoped feed when additional posts exist. A tile opens the exact post, retaining original-author reaction and tagged-recipe navigation. Returning restores the recipe scroll position; the original recipe DOM stays mounted but hidden, preserving comment input.

Initial loading and a confirmed zero-post result render no section wrapper, heading, placeholder or margin. A failed initial request shows only compact retry feedback, without treating a network failure as an empty result.

`postFeedQuery` filters by `recipe_id`, published status and non-hidden status using existing RLS. Page results are additionally restricted to visible tag metadata matching that recipe. Existing block, author/recipe visibility and safety-refresh handling applies. Recipe identity is part of the hook scope and both first-page/load-more requests; late results from another recipe/account cannot replace the active page. The existing recipe/post indexes serve these reads; no schema migration or backfill is needed.

`tests/recipe-tagged-posts.test.mjs` checks empty/loading omission, populated rendering, exact-post/all-post actions, retry, scoped reads and section placement. The feed tests also cover cross-recipe response isolation and suppressing inaccessible tags.

## Comments and original-author recognition — 2026-10-16

Published cards now have a collapsed **Comments** control. Eligible signed-in users with current content-policy agreement can write comments and one-level replies (up to 2,000 characters). Roots and each reply thread load only when expanded, 20 at a time. Submission IDs prevent duplicate comments on retries; a per-account limit permits at most ten new comments per minute. Publishing restrictions apply to comments too.

The server derives **Recipe author** from the currently linked recipe's actual author ID and current recipe visibility. It is a relationship badge, not account verification. The same orange badge identifies the author's comments and replies on their own recipe. Existing original-author hearts now have a matching subtle orange highlight and consistent heart icon.

Post visibility, blocks (including blocked root commenters), guardian eligibility, profile moderation and pending account deletion are checked in the database for both comments and replies. Clients cannot choose an author/badge or write directly to the table. Only the comment owner can erase their text. A deleted comment becomes **Comment deleted**, without its name/photo/badge in the display; other users' replies remain. Its minimal identifiers/timestamps stay attached until the post or account is removed. Post/profile deletion cascades comment records.

This increment does not add post-comment alerts or integrate photo-post comments into the existing recipe-comment report/moderation queue. Those remain follow-up work before a general public release of post interactions. Recipe-comment reporting/alerts are unchanged.

Validation: `tests/post-comments.test.mjs` covers badges on roots/replies, equal display names, server acknowledgements, retry IDs, concurrent submits, late consent responses, pagination and collapsed rendering. `tests/post-comments.integration.sql` uses synthetic metadata inside rollback transactions to verify original-author identity, idempotency, reply depth, owner-only safe deletion, blocked/hidden reads and denied writes.

## Post conversation alerts — 2026-10-19

The earlier post-comment notification gap is now addressed: comments alert the post owner, replies alert the parent-comment author and a distinct post owner, with no self/duplicate alerts. Existing preferences, blocked/hidden/deleted-content checks and 30-day expiry apply. Alerts open and highlight the exact thread even when it is older than the first comments page. See `post-conversation-notifications.md` for implementation and tests. Post-comment moderation/reporting is still separate pending work. Android phone push awaits Firebase setup and delivery integration; see `firebase-push-setup.md`.
# “I cooked this” recipe shortcut — October 20, 2026

Recipe details now offer an `I cooked this` camera button after comments, independently of the optional `Made this recipe` result grid. The shortcut therefore remains available when no result posts exist or result loading fails. It opens the existing post composer/gallery with the viewed recipe preselected; the title is shown during photo selection and editing, and the existing tag picker allows changing/removing it at caption review. Sharing uses the existing post publishing, recipe-tag validation and original-author notification flow. A guest is sent to sign-in with the recipe intent retained in memory; navigating elsewhere cancels that intent. A generic Post entry starts untagged, and account changes clear an open composer's recipe context. Cancel returns to the source recipe; sharing opens the resulting post. No new database schema or alternate posting endpoint was introduced.

Verification: 268 automated tests passed, including shortcut payload, preselected recipe through photo selection/caption review, generic Post isolation and guest sign-in intent. Android sync and JDK 21 debug build passed. On the Pixel 7 emulator, Chicken Adobo had no result section but still showed the shortcut; tapping it opened Android's photo picker, dismissing selection returned to a composer tagged Chicken Adobo, and cancelling the empty composer returned to the recipe. No photo or post was uploaded during verification. Screenshots: `screenshots/i-cooked-this-recipe-2026-10-20.png` and `screenshots/i-cooked-this-composer-2026-10-20.png`.


## Recoverable local drafts - 2026-10-20

The earlier memory-only composer limitation is resolved. Selected photos, crop sources, edits, captions and recipe tags now persist in an account-scoped local IndexedDB draft. Resume/discard, storage-error handling and interrupted-share recovery are documented in docs/post-drafts.md. Drafts expire after 30 days without a save and are purged on the next database open. They do not sync across devices.

