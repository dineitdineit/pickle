# Android login, recovery, links and Back

Implemented on `capacitor-android-bootstrap`. No production website deployment,
store submission or signing-key changes are included.

## Supabase configuration (required)

In Supabase → Authentication → URL Configuration → Redirect URLs, add these exact
entries, retaining the existing website entries and Site URL:

```text
com.getpickleapp.pickle://auth/callback
com.getpickleapp.pickle://auth/recovery
```

Google still redirects to Supabase's existing HTTPS provider callback. Do not
replace that Google provider URL with the app scheme. Supabase performs the last
redirect into Pickle. Existing Google provider configuration remains required.
Email templates should use Supabase's generated confirmation URL
(`{{ .ConfirmationURL }}`), rather than hardcoding a website reset destination.
Do not include credentials, codes, tokens or email-link contents in screenshots,
logs, support messages or commits.

Android uses PKCE and a system browser, with `skipBrowserRedirect: true`.
Web authentication keeps its current behavior. Request native recovery and email
confirmation in the installed app and open the resulting email on the **same
device**. Reinstalling/clearing app storage or starting another authentication
flow can invalidate the pending verifier: request a fresh link in that app.
Only one pending auth flow per installation is supported.

Callbacks must match the exact scheme, host and callback/recovery path, an
unexpired app-initiated intent and the Supabase PKCE verifier. Password editing
requires Supabase's `PASSWORD_RECOVERY` event during the exchange; a recovery
path or a pre-existing signed-in session alone cannot enable it. Token-fragment
callbacks are rejected. A link failure offers safe restart instructions without
displaying provider errors or callback contents.

Device storage contains only an auth-purpose/time marker (one hour), a recovery
owner/time marker (one hour), and Supabase's own managed session/PKCE storage.
The recovery screen can resume after process interruption for the same signed-in
owner within that hour. Completing recovery, cancelling recovery or signing out
clears its marker. Cancelling recovery signs out the reset-link session; it stays
on the recovery screen if sign-out fails. No extra token copy is made by the app.

## Shared recipe and post links

Public sharing remains `https://getpickleapp.com/?recipe=UUID` or `?post=UUID`.
The app accepts only canonical HTTPS content links or the equivalent
`com.getpickleapp.pickle://open?recipe=UUID` / `?post=UUID`. There must be exactly
one UUID target, with no unexpected parameters, credentials or fragment.
The usual server visibility/block/moderation checks still decide availability.
Cold-start and already-running app intents are supported. Links wait while a
post/recipe editor, My recipes, conversation or modal is open, preserving work.

The manifest declares HTTPS App Links, but **automatic opening from ordinary
HTTPS links is not verified until the website publishes the association file**.
Before release:

1. Obtain the **Play App Signing certificate SHA-256** from Play Console → App
   integrity. For an independently distributed release, use its actual signing
   certificate fingerprint. Do not use a debug certificate on the public domain.
2. Replace the placeholder in
   `docs/examples/android-assetlinks.template.json`, and publish the completed
   JSON as `https://getpickleapp.com/.well-known/assetlinks.json` (HTTPS, status
   200, JSON content type, no authentication or redirects).
3. Install the build signed with that certificate; run:

   ```powershell
   adb shell pm verify-app-links --re-verify com.getpickleapp.pickle
   adb shell pm get-app-links com.getpickleapp.pickle
   ```

4. Confirm `getpickleapp.com` is verified and test HTTPS links from another app
   with no explicit package. A package-targeted adb intent alone does **not**
   demonstrate domain verification.

Until association is deployed, the Android website includes an explicit
**Open in Pickle** link on shared recipe/post pages. This fallback also requires
deploying the updated website. Custom-scheme test intents work in the APK now.
For developer testing, Android Settings → Apps → Pickle → Open by default can
manually allow the domain; that is not production domain verification.

## Back behavior

One global native listener handles Back: topmost dialog cancellation first
(including disabled/busy cancellation guards), editor-specific navigation next,
then the visible screen's accessible Back button, then app navigation fallback.
Post stages return one stage at a time. Recipe steps return to the previous
page; the first page opens the existing cancel confirmation. Native pause still
flushes post drafts. Cooking dialogs and nested profiles/settings use the same
dispatcher. At Home, Back minimizes Pickle rather than killing the process.
Android's keyboard/file-picker/browser Back remains owned by those native UIs.

## Build and acceptance

```powershell
npm run android:sync
cd android
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21.0.12'
.\gradlew.bat assembleDebug --offline --console=plain
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Automated checks: URL allowlist/rejections, PKCE browser options, callback
deduplication, recovery purpose verification, expired/denied/failed links,
cold/warm shared intents, singleton listeners, Back modal/editor/navigation
priority, and existing draft/wizard tests. See `tests/native-navigation.test.mjs`.

The owner confirmed on 2026-10-21 that both Supabase redirect URLs were added.
This is owner-confirmed configuration, not an independently inspected Auth setting.
Manual acceptance still requires real Google login and recovery email flows on
the device. Test success,
browser cancellation, expired link, process restart and password change. Do not
publish until those flows and signed HTTPS domain verification pass.

### Development verification — 2026-10-21

- TypeScript/web build, Capacitor sync and JDK 21 offline debug APK build passed.
- All **311** automated tests passed.
- Updated APK installed successfully on the Pixel 7/API 36 emulator.
- Warm recipe intent opened the recipe screen; Android Back returned Home.
- Cold custom-scheme post intent and package-targeted HTTPS post intent opened
  the post screen. A synthetic nonexistent target displayed Post unavailable.
- First-page recipe-editor Back opened the existing cancel confirmation;
  another Back dismissed it and preserved the editor. The empty test editor was
  then discarded without publishing.
- Profile menu Back returned to the profile. An unrequested synthetic recovery
  callback displayed safe instructions and did not open password editing.
- Back at Home minimized Pickle to the Android launcher, including on the final
  rebuilt APK.
- No real recovery email, Google account login, content publication, moderation
  notice or push notification was sent as part of these checks. Signed domain
  verification and real OAuth/recovery completion remain outstanding.

References: [Supabase native links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking),
[PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow),
[Capacitor App](https://capacitorjs.com/docs/apis/app),
[Android App Links verification](https://developer.android.com/training/app-links/verify-applinks).
