# Pickle moderation operations

2026-10-15 retention update: agreement version 2026-10-15.3; detailed closed-case evidence expires after 30 days, minimum history after 90 days with active-case/appeal/enforcement exceptions. See [retention operations](data-retention.md). Earlier unconfigured-retention descriptions are superseded.

2026-10-15 update: Operator/18+ update: current agreement version is 2026-10-15.2. Account activation requires the new self-declaration. Evidence retention remains unconfigured; recommended periods in docs/legal/retention-recommendations.ko.txt are proposals, not deployed expiry jobs.

Applied on 2026-10-15. Current published content policy: **2026-10-15**. This replaces the earlier moderation shortcuts described in `content-moderation.md`. It does not authorize sanctions against particular live users.

## Prohibited content

The policy covers recipes, images, comments, ratings/reviews, profiles and messages. Prohibited categories include harassment, hate and threats; sexual exploitation and explicit sexual content; personal information shared without permission; scams and spam; copyright infringement and impersonation; dangerous cooking instructions and unsupported disease-cure claims; rating manipulation; and evasion of enforcement. Knowingly false reports can be restricted after review. Legitimate low ratings, respectful criticism and different tastes are allowed.

## Responsibility and procedure

1. Open `/admin` → **Moderation → Operations & appeals**. Only server-assigned `admin` and `official` accounts can access the queue. Suspended staff lose administrative access.
2. New reports create an incident case. Open reports on the same target join the same case, including reports from different people. Reporter count is evidence of reporting volume, never an automatic finding or strike. A new report about an already decided incident must be checked against history and dismissed as already addressed rather than treated as a new violation. A later, distinct incident requires its own evidence.
3. Assign an uninvolved reviewer. The subject and reporters cannot review their own case. Set priority and record a specific internal assessment. Urgent/high cases have a 24-hour first-response target; normal cases have a three-business-day target. Additional-information cases remain visible in the queue. Business-day calculations use Monday–Friday in Asia/Seoul, without a holiday calendar. Targets are operational goals, not guaranteed outcomes.
4. Inspect retained report snapshots and **Current content and full context**. Recipe context includes steps, ingredients and images; media is concealed until revealed. Profile context contains public identity fields, not private conversation history. Do not download or redistribute suspected illegal material; escalate through the appropriate reporting channels.
5. Record the content action, clause, severity, public reason and separate internal evidence/rationale. Both reasons and notes are required. Dismissal makes no confirmed strike. Warnings and confirmed violations count once per decision, rather than once per report. Previous confirmed incidents are considered within a rolling 90-day window; temporary, rejected, dismissed and overturned decisions are excluded.
6. Seven-day, 30-day and permanent suspensions require a proposal followed by a separate final approval action and approval note. The responsible `official` account approves; when no official account exists, an administrator can act as the responsible operator. The system does not require two distinct staff accounts for final approval, so a second reviewer should be used when available. Case assignment, findings, proposals, approvals and reversals are audited. Stale updates and repeated actions are rejected by the server.
7. Close the case with its linked reports. Authors receive an account-status record, in-app notification and private email-outbox entry. Public notices include the content/account action, policy clause, reason and end date when applicable. Reporter identity and internal notes are excluded. Reporters receive a generic completion notice. Email delivery uses the configured worker/provider and still requires actual provider acceptance and inbox delivery.

Legacy **Comments** and **Other reports** tabs are read-only history. Old direct moderation mutation RPCs are restricted so they cannot bypass assignment, reasons and approval. A responsible operator retains a narrowly scoped restoration path for historical unlinked content; new decisions use the operations and appeal paths.

## Sanction criteria

| Finding | Content action | Account action |
| --- | --- | --- |
| No violation / duplicate already handled | Dismiss; restore eligible provisional hiding | None |
| First minor violation | Warning and proportionate correction, hiding or public removal | Warning |
| Repeat confirmed violation | Correction, hiding or public removal | Three-day publishing/photo/message restriction; at least one prior confirmed incident unless critical |
| Persistent or serious violation | Hiding or public removal | Seven- or 30-day read-only suspension; at least two prior confirmed incidents unless critical, with final approval |
| Critical violation / demonstrated enforcement evasion | Hiding or public removal | Permanent suspension after final approval; evasion requires prior confirmed evidence |
| Critical case awaiting long/permanent approval | Provisional hiding when appropriate | Provisional 24-hour read-only suspension; not a confirmed strike |
| Confirmed deliberate false reporting | Document finding | Seven-day reporting restriction |

Three-day restrictions stop publication, content/photo uploads and sending messages; normal browsing and other social actions remain available. Seven-/30-day, permanent and provisional suspensions enforce read-only publishing, messaging, social/profile changes and draft writes on the server, including existing sessions. Logging in, viewing account status, submitting appeals, ordinary safety reporting, deleting one's own content and the existing account-deletion process remain available. The separate false-reporting restriction affects reports only. Fixed-duration account restrictions expire automatically; content findings remain until reviewed or reversed.

Profile content hiding masks the public name/avatar/bio from other viewers and search and disables the profile contact controls. The account owner can still inspect their own profile. It does not erase an account. Hiding a profile by itself is not a universal messaging ban; choose the appropriate account sanction when interaction must also be restricted.

## Appeals and reversals

Users open the profile menu → **Account status & appeals** to see public decisions and active restriction periods. One appeal per decision is available for 14 days after notification, including while suspended. The explanation must be 20–2,000 characters. The operational review target is seven business days. When another eligible staff member exists, the original proposer cannot review their own decision's appeal. A subject or reporter is never an eligible reviewer.

The reviewer records a public response and separate internal rationale. Upholding preserves the decision. Overturning revokes its strike and account restriction and restores eligible content, unless another standing confirmed decision still requires it to remain hidden. A responsible operator can also reverse a finding with an audited public reason and internal note. Final decisions supersede provisional restrictions for the same case.

## Consent, storage and operational limits

Publishing/editing recipes, comments/reviews/ratings, recipe photos, avatar uploads, messages and chat photos require the current server policy agreement. Policy version changes require renewed explicit agreement; existing users are not silently enrolled. Safety reporting, appeals and content/account deletion do not require renewed agreement.

“Remove” means removal from public display with a moderation marker, not physical erasure of stored files or report evidence. Profile hiding likewise masks public identity rather than deleting records. Existing public media URLs and copies already cached on devices cannot be recalled by visibility flags. Retention periods, irreversible erasure of evidence/files, and a dedicated legal-request process remain separate decisions; this implementation does not add an indefinite-retention policy or an automatic purge schedule.

The app checks an opaque public visibility version and per-user block/sanction version while visible, and refreshes affected screens on changes or foreground entry. Background devices can retain their previously rendered pixels until resuming; every new guarded read/write is checked on the server. This is not push removal of downloaded content.

## Verification

`tests/moderation-operations.test.mjs` checks confirmed responses, duplicate and late requests, appeals and usable account status under suspension. SQL fixtures verify intake, privacy, conflicts, stale actions, warning/restriction thresholds, critical proposals and approval, permanent suspension, expiry, appeal reversal, profile masking/search/contact controls, visibility refresh and owner bypass rejection. SQL runs only inside `BEGIN` / `ROLLBACK`; fixture roles, consents, sanctions, notices and email jobs are discarded. The retired legacy direct-action integration suite is historical and no longer represents the supported mutation path.

Android device acceptance is separate: sync the web bundle, run Android Studio **Run ▶**, inspect both admin and user flows with test accounts, then perform a controlled email delivery test if required.
