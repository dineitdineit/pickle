# Pickle Android: first device build

This is the initial Capacitor Android project, not a store-ready release.
The UI is bundled from `dist`; recipe data still comes from Supabase.
App ID: `com.getpickleapp.pickle` (confirm before first store submission).

## Build environment

- Node.js 22 or newer and npm.
- Android Studio with Android SDK platform 36 and its build tools.
- JDK 21 configured as the Gradle JDK.
- A Galaxy device with Developer options and USB debugging enabled.

Install dependencies with `npm ci`. Create `.env.local` containing the existing
project's **public** client configuration:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_CLIENT_KEY
```

Never put a Supabase service-role key in the app.

## Run on a phone

```sh
npm run android:sync
npm run android:open
```

Android Studio opens the `android` project. Let Gradle finish syncing,
connect the phone, select it as the run target, and press Run.
Use Android Studio's Build menu to generate a debug APK for manual installation.

On macOS/Linux, `npm run android:apk` builds a debug APK at
`android/app/build/outputs/apk/debug/app-debug.apk`.
On Windows, run `npm run android:sync`, then run `gradlew.bat assembleDebug`
inside the `android` directory.

Run `npm run android:sync` after every web-code change before rebuilding.
Updating the website alone does not update an already installed app.
Debug APKs are for testing; Google Play needs a signed release AAB and a
protected signing key. `android:bundle` only generates the release bundle;
release signing must be configured separately before submission.

## First device checks

- Recipe list and detail load, and text fields work with the keyboard.
- Email/password login persists after closing and reopening the app.
- Gallery selection uploads a cover image; draft saving and publishing work.
- Dark/light themes, status bar and bottom gesture areas are readable.
- Offline and failed-upload behavior preserve the user's draft.

## Remaining native integration before release

- Google/Apple OAuth and password recovery currently redirect to the website.
  Add native callback handling and provider/Supabase redirect configuration
  before enabling these flows for the native release.
- Connect Android Back to Pickle's internal screens, including unsaved drafts.
- Verify external video links and sharing on a physical device.
- Replace generated Android launcher/splash placeholders with Pickle assets.
- Implement store privacy, account deletion and content moderation requirements.
- Create and test the iOS project on a Mac as the next platform stage.

No APK or physical-device verification has been completed in the initial
bootstrap environment: it does not have an Android SDK or JDK 21 installed.
