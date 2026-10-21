# Android phone notifications

Implementation and verification: October 20, 2026. Branch `capacitor-android-bootstrap`. No store or website deployment.

## Current state

Activation update, October 20, 2026, 17:56 KST: after the user confirmed device opt-in and saved `PUSH_DELIVERY_ENABLED=true`, the private database gate was enabled. One session-bound device is registered. The worker returned HTTP 200 with no error, credential status `ready` and zero sends. Both gates are now on for controlled two-account device testing. Background/killed-app delivery and taps are still unverified. The setup notes below describe the initial disabled state; this activation update supersedes it.

Firebase Android client package matches `com.getpickleapp.pickle`. Google OAuth authentication with the service-account secret succeeded. Both live-delivery gates remain off: Edge Function secret `PUSH_DELIVERY_ENABLED=false` and `push_helpers.state.enabled=false`. No live alerts were sent. The scheduled dispatcher makes no network call while the database gate is off.

Phone alerts are optional under Notifications → upper-right settings → Phone notifications, on Android only. The user sees the Firebase data-use notice before permission/registration. Activity categories still control activity alerts; the phone switch controls this device, including DMs. Safety notices in the in-app inbox and existing emails are unaffected.

The APK was built with JDK 21 (`C:\Program Files\Java\jdk-21.0.12`). Android Studio's bundled JBR currently reports Java 25, which this Gradle version cannot use. In Studio set Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK to an installed JDK 21 if necessary. No machine-specific JDK path was committed to Gradle settings.

## Data and authorization

Private `push_helpers.devices` contains token, installation UUID, SHA-256 unlink-capability hash, account/session UUIDs and last registration time. Sessions are validated against `auth.sessions`; registration requires a real eligible signed-in user. Tokens cannot silently transfer between installations. The client stores the installation ID/capability and opted-in account, but does not persist the raw FCM token in browser storage. The capability permits removal after signout without a still-valid login session. Never print token/capability values when diagnosing.

Firebase auto-init and analytics collection are disabled in the Android manifest. Explicit enable requests the Android notification permission and registers with FCM. Account change/logout clears delivered alerts, deletes the native FCM token and unlinks the server registration; session deletion also cascades server device/job removal. Network failures are displayed without claiming a successful setting. Device renewal occurs on app startup; registrations expire after 30 days without renewal.

`push_helpers.jobs` stores source and recipient/device IDs, lease/retry/status timestamps, with a one-day expiry. It does not snapshot comment/message text or photos. Source/device uniqueness avoids duplicate enqueue; five attempts with exponential backoff bound retries. Lease recovery can repeat a send whose provider acceptance was not acknowledged. Android uses a stable tag to replace the same visible alert; no exactly-once claim is made. FCM TTL is five minutes. Already-delivered system notifications cannot be recalled from a remote device when content is later deleted; their text is generic and tap access is rechecked.

Before sending, the worker checks the current account/session, opt-in device, unread state, public content access, blocks, deletion/hidden status, current activity preferences and per-author recipe alerts where applicable. Tokens rejected as UNREGISTERED are removed only if they are still the rejected token. Network/429/5xx failures retry; permanent request errors fail. Worker responses contain aggregate counts and sanitized stages/error codes only.

The private worker secret is generated in Supabase Vault and never exported. The Edge Function authenticates `X-Push-Worker-Secret` against a service-role-only RPC; gateway JWT verification is off because this custom authentication is enforced by the function. No end-user can call the queue worker RPC or read private tables. RLS with no end-user policies on these private tables is intentional. Existing security-advisor warnings about admin analytics and leaked-password protection are separate from this feature.

Minute schedules purge expired registrations/jobs and dispatch only if the database gate is enabled. The Edge Function checks its separate secret switch before claiming jobs. The service-account JSON stays in Edge Function Secrets; it is never included in Android/browser code. The client project ID in worker source is public configuration used to catch a mismatched credential.

## Acceptance checks before activation

1. Run the updated Android project/APK, sign in, open Notifications → settings. With live sending still disabled, explicitly enable Phone notifications and approve Android permission. Confirm the registration message, then turn it off and confirm removal. Do not send token screenshots.
2. Check denied permission, offline registration/unlink and Android system notification settings. Verify no permission request on first launch. Restart while opted in and confirm token renewal; switch accounts and confirm no old-account tap can open a destination.
3. Coordinate a controlled two-account delivery test. Enable both gates only for this test, turn on the receiving device's phone setting, send a message/comment/reply from the other test account, and verify foreground refresh, background alert and notification tap after normal app process termination. Android force-stop can suppress notifications until the app is reopened; a swiped-away app is a different case.
4. Verify notifications already read, muted, blocked, hidden or deleted before dispatch are skipped. Check removed accounts/sessions and token rotation. Verify recipe/post reply taps open the intended comment, and that inaccessible targets show an unavailable message instead of another account's content.
5. Turn gates off after a failed test; inspect only aggregate queue counts and sanitized statuses. No real-user broadcast or store release is part of this work.

Automated tests cover payload privacy, fixed OAuth audience/scope, missing/mismatched credentials, disabled delivery, invalid tokens and retries, unavailable targets, opt-in timing, late registration after logout and account/installation tap isolation. The SQL fixture uses synthetic accounts/tokens, never calls the network dispatcher and rolls everything back. Native verification currently covers APK compilation, installation, app launch, plugin/manifest registration and no unsolicited notification permission; signed-in and live delivery acceptance remains outstanding.
