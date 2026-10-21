# Post conversation notifications

Implemented October 19, 2026, on `capacitor-android-bootstrap`.

- A new comment notifies the post owner (`post_comment`).
- A reply notifies the parent-comment author (`post_reply`), and also the post owner if they are a different recipient. A person who is both receives one reply notice. Actors do not receive notices for their own actions.
- Events are inserted by an authenticated server trigger in the comment transaction. Retried comment IDs and a unique recipient/comment index prevent duplicate notices. Recipients and authorship cannot be chosen by the client.
- Existing global/comment/reply preferences apply. The Comments & photo feedback switch covers recipe and post comments and recipe-tagged photos; Comment replies covers both recipe and post replies. Moderation notices remain independent.
- Notifications contain post/comment references, not comment-body snapshots. They expire after 30 days through read visibility and the existing scheduled retention function. Unblocking or enabling preferences does not backfill suppressed events.
- Blocked actors/root authors/post owners, hidden or deleting accounts/posts and ineligible recipients are excluded. A soft-deleted target comment makes its notice unavailable; deletion of a post/comment removes linked notices through foreign keys. Replies to a deleted root can remain accessible if their own text/author remains visible.
- Tapping opens the exact post and a highlighted, automatically expanded thread. An RLS-protected exact-context endpoint loads an older root/reply independently of feed pagination; it never searches other posts. Missing or inaccessible targets show a retry/unavailable message. Duplicate copies of pinned comments are omitted from the ordinary page.
- Existing read-after-leaving and unread styling remain in place. Realtime refresh and unread counts use the same inbox/RLS path.

October 21 status correction: Android push opt-in, session-bound device registration, private queue/worker and authenticated tap routing are implemented. Firebase server authentication and device registration were checked during earlier work; physical two-account delivery still needs acceptance testing. Delivery enablement is a server configuration, not a permanent disabled feature. See `android-push-delivery.md` and `firebase-push-setup.md`. New post notifications do not send email. Post/comment and selected-message reporting/moderation are now implemented; see `post-message-reporting.md`.

Verification: synthetic identities and records in rollback SQL tests for recipients, retry/deduplication, preference suppression, deleted targets and older-thread context. Unit/render tests cover wording, navigation, exact target validation and existing comment behavior. No real user comments, emails or phone pushes were sent during these checks. Physical two-account testing remains necessary.
