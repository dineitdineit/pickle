# Notification inbox

Updated 2026-10-16.

The inbox uses compact rows with a 36px avatar, 14px activity text and 12px relative timestamps. Actor names and activity share the same line. Follow controls are shown for follower notices, rather than every comment/recipe row. The extra “Your notifications” and “Mark as read” controls are removed. Unread rows have a light grey background (neutral charcoal in dark mode); read rows have no highlight. Settings entry points share `src/SettingsIcon.tsx`. The header’s settings button opens account-level notification preferences, also accessible through Profile settings.

## Seen and read

- An unread row is considered seen after at least half of it is in the usable viewport for 500ms while the document is visible. The observer excludes the lower 96px occupied by navigation. Already-read, off-screen and quickly scrolled rows are excluded.
- Merely loading or refreshing the inbox does not mark rows read. The visit’s seen IDs are acknowledged when leaving for another screen, a profile, settings, or on `pagehide`.
- Updates include the visit’s recipient ID, the exact seen IDs and `read_at IS NULL`, in batches of at most 100. Only confirmed changes refresh the unread badge. Existing click-to-open acknowledgments remain supported.
- Row-level security remains authoritative. A changed login cannot write to the previous user’s inbox. No content body or persistent device browsing/seen log is created.
- A failed connection leaves the server unread state intact; the next visible visit can retry. Abrupt OS/app termination can prevent a final network request from finishing. No successful receipt is fabricated.

## Preferences

`public.notification_preferences` contains one optional row per account: `enabled`, `follows`, `recipes`, `comments`, and `replies`. Missing rows mean all activity types are enabled. RLS restricts reads and changes to the account holder; changes also require an eligible, unrestricted account. Preferences are confirmed by a matching server response and apply across devices.

The server’s `BEFORE INSERT` notification filter drops disabled optional activity. Pausing activity preserves category choices. Existing inbox contents remain, and a cook’s existing per-author new-recipe bell preference still applies. Safety/moderation notices and service emails are not suppressed. These settings do not implement phone push notifications or marketing email controls. Preferences cascade on account deletion; they are not an additional 30-day backup copy.

Validation: `tests/notification-inbox.test.mjs` checks viewport exposure, delayed exit receipts, background visibility, failed writes, account-matched preferences and compact timestamps. `tests/notification-preferences.integration.sql` uses synthetic accounts inside BEGIN/ROLLBACK to verify category filtering, pause/default behaviour, essential notices, read scope, cross-account isolation and deletion.
