# Reports and moderation

**2026-10-15 update:** The current process is documented in [Moderation operations](moderation-operations.md). Use **Operations & appeals** for actions. The direct-action controls described below are historical; Comments and Other reports are now read-only history. The new workflow also supports assigned review, profile hiding, account restrictions, final approvals and appeals.

Recipe pages have **Report recipe**. Reviews from another user have **Report review**. Another user's profile has a three-dot **Report user** button at the top right. Comment reporting remains in the comment menu.

Reporting requires a signed-in, non-anonymous account. Users select a reason and may add up to 500 characters of detail. A report is acknowledged only after the server returns its saved ID. Self-reporting is rejected. Duplicate open reports for the same target by the same reporter reuse the existing report.

## Admin dashboard

Open `/admin` and sign in with an existing admin or official account. Roles must be assigned through trusted administration; client users cannot assign themselves an admin role.

Under **Moderation**:

- **Comments**: dismiss, hide or remove, with an optional admin note.
- **Recipes / reviews / users**: filter by type and status, with 50 reports per page.
- **Recipe / review**: hide or dismiss an open report; restore hidden content from reviewed history.
- **User**: mark reviewed or dismiss. This does not suspend, delete or otherwise change the account.

Admin notes accept up to 1,000 characters and are saved when an action is taken. The content queue displays the saved note and target-wide action history, including the responsible admin ID and time. Reports preserve a snapshot of the original content. Hide / resolve / dismiss processes all open reports about the same target; restoration preserves the reviewed report status and adds a restoration action.

Hidden reviews are excluded from the public review list and rating summaries, including summaries requested by admins. The review author can still see their own hidden review with a moderation notice. Editing the review does not automatically restore it. Hidden recipes and hidden/removed comments are excluded by existing database visibility policies.

Actual recipe/review hide and comment hide/remove transitions now create an author-only in-app notice and a private email-outbox entry in the same transaction. The public-facing reason excludes reporter identity and internal admin notes. See [email setup](email-setup.md) for the official sender, provider consent, credentials and delivery queue. The authenticated worker connection passed and scheduled delivery was enabled on 2026-10-13; actual provider acceptance and inbox receipt still need a controlled delivery test.

## Security and verification

Report tables and audit records use RLS and are readable only by signed-in, non-anonymous admins. Clients cannot write moderation status directly. Public RPCs use invoker wrappers; privileged operations live in the unexposed `moderation_helpers` schema, enforce authentication and admin checks, and use an empty search path.

Target locks serialize submissions and administrator actions. Closed reports reject stale processing. UI guards prevent double clicks; the administrator UI confirms persisted status before displaying success.

Run `npm test` for client behavior. Run `tests/content-reports.integration.sql` inside `BEGIN; … ROLLBACK;` against a database with at least two profiles. It temporarily changes a fixture reporter's role inside the transaction and checks:

- Report persistence, snapshot, duplicate prevention and input validation.
- Signed-out / anonymous / non-admin restrictions and direct-write denial.
- Admin queue visibility, hide / restore, reviewed status, admin notes and audit history.
- Hidden reviews removed from rating summaries.
- User review / dismissal without account restrictions.
- Existing comment hide / remove / dismissal and rejection of repeated processing.

The integration checks were executed against the connected project on 2026-10-13 and rolled back. No real report or moderation action was retained.

Android verification: after `npm run android:sync`, press **Run ▶** in Android Studio. With two accounts, report the second account's recipe/review/profile; verify the saved report in the admin queue. Dismiss a test report or hide then restore test content. Do not moderate real content solely for testing.
