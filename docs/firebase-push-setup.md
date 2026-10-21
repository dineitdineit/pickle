# Pickle Android push setup

October 19, 2026. In-app post-comment/reply notifications are implemented separately. Phone push is not enabled by this document or by adding a Firebase client configuration file alone.

## Step 1 — create the Firebase project

1. Open https://console.firebase.google.com/ with the Google account you will use to manage Pickle.
2. Choose Create a project (or Add project) and name it Pickle. Keep the generated project ID unless you prefer another available ID; record it for the later server configuration.
3. Google Analytics is optional for Cloud Messaging. Leave it off for the initial messaging setup if you do not intend to add analytics.
4. Create the project and open its dashboard.

## Step 2 — register this Android app

1. From Project overview, choose Add app → Android.
2. Enter the exact package name: `com.getpickleapp.pickle`.
3. An app nickname such as Pickle Android is optional. An SHA certificate fingerprint is not required for this FCM setup; Google sign-in is a separate setup.
4. Register the app and download `google-services.json`.
5. Put the file at `C:\Users\dinei\Projects\pickle\android\app\google-services.json`.

The configuration is now excluded by the repository's `.gitignore`. Do not paste the file into chat. Do not confuse this client configuration with an Admin SDK/service-account private-key JSON file; never put the latter in the Android app, browser variables or repository.

## Step 3 — let Codex finish the integration

Latest activation update (October 20, 2026, 17:56 KST): the user enabled phone notifications and set the delivery secret to true. The private database switch is now enabled, one device registration is confirmed, and the worker returned HTTP 200 / ready without sending any notification. Controlled two-account device delivery tests are the next step; earlier disabled-state notes below describe setup history.

After the file is in place, say: “Firebase Android configuration is ready.” Do not install additional Firebase SDKs manually into this Capacitor project; Capacitor's push plugin brings its Android FCM dependency.

### Server credential setup (checked October 20, 2026)

The Android client file has been found locally and its package matches `com.getpickleapp.pickle`. It is ignored by Git. This confirms client configuration only; push delivery is not yet enabled.

1. Open the same project in the Firebase console.
2. Click the gear beside **Project overview → Project settings → Service accounts**.
3. Under **Firebase Admin SDK**, select **Generate new private key → Generate key**. Keep the downloaded JSON outside this repository and outside `android/app`. This is a separate file from `google-services.json`.
4. Open the downloaded file locally in a text editor. Do not paste its contents into chat or a terminal command. Copy the entire JSON document, including its opening and closing braces.
5. Open the Pickle project in Supabase: **Edge Functions → Secrets**.
6. Add a secret named **`FIREBASE_SERVICE_ACCOUNT_JSON`**. Paste the complete JSON into its **Value**, then save. Preserve the JSON's `\n` escapes inside `private_key`; do not extract the key or manually replace those escapes.
7. Add **`PUSH_DELIVERY_ENABLED`** with value **`false`**. This reserves the delivery switch for the upcoming worker; saving these secrets alone does not enable sending or install any worker.
8. Clear the clipboard after saving. Keep the downloaded key in protected storage outside source control, or remove the local copy if it is no longer needed. Deleting the downloaded file does not revoke the service-account key; a leaked key must be revoked in Google Cloud IAM.
9. Confirm only: **“Firebase server secret saved, delivery disabled.”** Do not send the JSON, a private key, a token, or a screenshot revealing a secret value.

The sender will use the JSON's `project_id`, `client_email` and `private_key` to obtain short-lived OAuth credentials for FCM HTTP v1. No private key belongs in Vite variables or the APK. If Google Cloud blocks key creation through an organization policy, do not bypass that policy; use a managed credential approach instead.

Native verification status on October 20: ADB is available, but no emulator or phone was connected. Permission prompts and delivery have not been tested on Android. Start a Google Play-enabled Android Studio emulator or connect a test phone for the later native checks.

Server setup references:
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
- https://supabase.com/docs/guides/functions/secrets

Implementation status, October 20:
- Installed pinned `@capacitor/push-notifications` 8.1.3 and synced Android; debug APK built and launched in the Pixel 7 emulator.
- Added a white notification icon, `pickle_activity` channel and explicit phone-alert enable action in Notification settings. Firebase auto-init and analytics collection are disabled. No first-launch permission prompt.
- Added private, session-bound device registrations, token rotation handling, capability-based unlinking after logout, and account/session-deletion cascades.
- Deployed `android-push-worker`, validated the configured service account against the Android Firebase project and successfully authenticated with Google OAuth. Credential values were not retrieved or printed.
- Added a bounded queue, source/device uniqueness, leases, five-attempt retries, read/visibility/block/preference rechecks and generic lock-screen text. A stable Android notification tag reduces duplicate visible cards; FCM is not an exactly-once service.
- Added authenticated tap routing, including retained cold-start events, to messages, exact recipe/post comments, profiles and the notification inbox. Account and installation IDs must match; all destination reads use current RLS.
- Updated privacy disclosures. Both the Supabase secret switch and private database switch remain disabled. No live push notification was sent.
- Still required: signed-in device registration and permission tests, and two-account foreground/background/killed-app delivery/tap tests on a real phone. Emulator launch alone does not verify those flows.

See `docs/android-push-delivery.md` for operations, retention and remaining acceptance tests.

FCM registration tokens and routing identifiers are an additional opt-in data flow. The in-app inbox remains usable without phone notifications.

References checked October 19, 2026:
- https://capacitorjs.com/docs/apis/push-notifications
- https://firebase.google.com/docs/cloud-messaging/android/get-started
- https://developer.android.com/develop/ui/compose/notifications/notification-permission
