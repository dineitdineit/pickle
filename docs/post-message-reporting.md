# Photo-post, post-comment and selected-message reporting

Implemented 2026-10-20 using the existing case workflow.

## Entry points and review

- Signed-in nonauthors: post **… → Report post**.
- Signed-in nonauthors: **Report post comment** on a post comment or reply; deleted comments have no action.
- A received message: flag button **Report message**, next to its time. The dialog explains that only this message and its attached photo are shared with moderation. Own sent messages have no Report button.
- Admin → Other reports includes post, post comment and message filters. Admin → Operations & appeals provides assignment, public reason/policy clause, internal evidence note, hide/remove/provisional action, decisions, reversals, sanctions and appeals using the existing reviewer/conflict/approval rules. Media stays concealed until revealed. A message case never loads adjacent conversation messages.

Server submission accepts `post`, `post_comment`, `message` alongside existing types. Post/comment visibility and message-recipient status are checked server-side; an arbitrary message handle gives no access. Direct messages get an immutable UUID report handle without changing their bigint ordering IDs. Reports are deduplicated while open, serialized per reporter/target, and new content reports are capped at 30 per rolling day. A victim can submit a received-message report after blocking its sender, using the already-known handle; reporting does not restore conversation access.

## Enforcement and notices

Hidden/removed posts disappear from discovery and ordinary reads. A hidden/removed post comment also hides its replies. Removed flags are reversible through the existing moderation workflow, not physical erasure of account-owned content. Author deletion is separate and is not undone by a reversal.

Hidden/removed messages are excluded by restrictive SELECT RLS, including inbox previews and unread counts. Chat photo reads additionally check moderation and participant/block access; an upload permission cannot bypass a sent message's moderation. Sent/evidence photos cannot be deleted as unused uploads. Pending Android push delivery rejects moderated messages. Existing chat polling/foreground/realtime refresh removes stale rows, and a response racing a new confirmed send is retried rather than retaining a cached moderated body. Public post/comment flag changes update the existing public safety version; private-message actions do not create a global public change signal.

Author in-app notices and service-email jobs are created atomically with decisions, including content type, public action/reason and the existing appeal route. They exclude reporter identities, report details, message bodies/photos and internal notes. The existing email worker handles these generic notice jobs; no new credentials or provider are needed. Tests verify queue creation, not real mailbox delivery. Previously delivered notifications, rendered/cached content and issued short-lived image URLs cannot be recalled; signed links normally expire after five minutes.

## Evidence and retention

Post snapshots contain caption and photo references. Comment snapshots contain the selected text and post/thread identifiers. Message snapshots contain the selected text, sent time and attached photo reference, with reporter/subject identifiers held in the restricted report record. Admin chat-photo access requires an unexpired linked case or open appeal, not general inbox access. No separate copy of a private conversation or new photo backup is created. A source file may become unavailable after account deletion; that immediate deletion policy is unchanged.

Existing detailed-evidence expiry (30 days after final case/appeal closure) and minimum enforcement history (90 days) apply. Context/media authorization checks evidence expiry even before scheduled cleanup. Existing account deletion, retries and cleanup continue to apply. Privacy copies in the app and legal text directory describe the new report scope.

## Verification

`tests/post-message-reporting.integration.sql` runs inside BEGIN/ROLLBACK with synthetic users, posts, comments and Storage metadata. It covers intake/deduplication, admin filters, selected-message privacy, participant/stranger checks, forbidden flag writes, hide/remove, thread exclusion, inbox/media restrictions, author notices/email privacy, reversal, expired evidence and guest denial. No files, real reports or external emails are sent by this test.

Client tests cover readable report labels and private-message disclosure, exact submission acknowledgements, admin filters, nonowner post options and removal of a cached moderated latest message. Existing post/comment/message tests continue to run.

### Verification results (2026-10-20)

The database integration suite passed, including a synthetic active device/queued message push that was eligible before moderation and suppressed afterward; no network delivery was invoked. Existing security-advisor warnings were unchanged. All 302 automated tests passed. The Pixel 7 / API 36 emulator showed the report flag on a received message and the selected-message privacy notice, reason picker and submit/cancel controls; the dialog was cancelled without creating a real report. No live photo-post/comment report was filed; those paths were exercised in component and database tests. The app privacy text and current/draft legal text files were updated.

