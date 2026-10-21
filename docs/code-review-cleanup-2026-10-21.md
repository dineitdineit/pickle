# Code review and cleanup — 2026-10-21

Branch: `capacitor-android-bootstrap`. Existing feature work was preserved.
No production deployment, store release, credential changes, live database
schema changes or user-content mutations were made by this cleanup.

## Review scope

- Import/reachability scan across 153 TypeScript/TSX/CSS source files: all 152
  application/style files are reachable; `vite-env.d.ts` is an ambient declaration
  and is correctly excluded from the runtime graph. The final graph has 154 files
  after adding the shared theme helper, with no unreachable application module.
  No entire source module was safe to delete as unused.
- Static call matching across the frontend, six Edge Function entry points and
  102 migration files. Reviewed auth/native callbacks, loading/retry boundaries,
  drafts, account deletion, reporting, worker authorization and shared helpers.
- Read-only inspection of the legacy analytics RPC definitions and grants, plus
  Supabase security advisories. A synthetic non-admin claim was used inside a
  rolled-back transaction to confirm admin analytics access is denied.
- Existing automated suite, formatting, TypeScript, web build, Capacitor sync,
  Android debug build and representative emulator UI checks.

This is a source/architecture review and regression pass, not a certification of
every provider setting or an exhaustive device/account/production penetration test.

## Cleanup applied

- Removed unused frontend `ai` dependency and 11 installed packages. The deployed
  AI function still uses its explicit, pinned `npm:ai@7.0.142` server dependency.
  No model/provider/billing setting was changed.
- Made 12 internal helpers/constants private instead of exporting unused module
  APIs; retained the functions that still serve active features.
- Removed the admin Recent activity component/type block that CSS permanently
  hid. Recipe performance, search summaries and retention metrics remain.
  The legacy server RPC retains its response shape for compatibility.
- Removed unused old social-profile/tab/grid styles, duplicate dark-mode selectors
  and stale comments. Normalized remaining dark-mode `#bbb` text to the shared
  gray token.
- Restricted Tailwind source detection to `src`, excluding unrelated workspace
  diagnostics/output/tests from utility generation. The malformed generated CSS
  warning is resolved. See [Tailwind source detection](https://tailwindcss.com/docs/detecting-classes-in-source-files).
- Replaced inline-style/DOM-shape CSS patches with explicit recipe hero styling,
  tab corner sizes, recommendation spacing and carousel margins.
- Normalized source formatting and import spacing using the existing formatter;
  all source formatting checks now pass.
- Excluded the workspace scratch `tmp/` directory from Git so generated debug
  artifacts and temporary source backups are not accidentally committed.

## UI polish

- Reused BackIcon for authentication, recipe error and video screens; video titles
  truncate cleanly rather than pushing the back control out of alignment.
- Added consistent keyboard focus outlines and current-page navigation semantics.
- Consolidated theme storage/application logic. Theme changes remain usable if
  local storage is blocked; Android status/gesture bar backgrounds and icon
  contrast follow the app theme, including on resume/configuration changes,
  through a small local Appearance plugin with no new npm dependency/permission.
- Native callback notices now have a contained, wrapping layout, readable theme
  colors and a larger dismiss target. The Android website Open in Pickle action
  is presented as a button-style link.
- Compacted the older profile **menu** summary: less top whitespace, 88px avatar,
  smaller shared type sizes and consistent follow-count touch areas. Its support
  page headings use the 20px section size. Public profile layouts are unchanged.

## Unfinished or not yet verified

| Item | Current status / next work |
| --- | --- |
| Waraeat/stories | Deliberate disabled Coming soon option. Story creation, expiry and viewing are not implemented. |
| Optional AI for guardian-required accounts | Explicitly blocked pending separate guardian AI consent. Manual ingredient/step entry remains available. Adult AI integration exists; live enablement/billing was not inspected or exercised in this cleanup. |
| Native Google/recovery | Implemented; owner confirmed Supabase redirects were added. Real Google login and a fresh recovery email still require same-device acceptance testing. |
| HTTPS App Links | Manifest/parser/fallback exist. Automatic domain association still needs a valid hosted assetlinks file and matching release/Play signing certificate. |
| Phone push and service email | Queue/worker/preference/author-notice code exists. Two-account delivery, background device receipt and real email inbox arrival are separate acceptance checks; they were not sent by this review. |
| Catalogue scaling | Home and recipe search still fetch/filter catalogue data on the client. Larger catalogues need server-side matching/ranking/pagination; visible slicing is not server pagination. Saved details and exact linked content already have independent retrieval paths. |
| Apple sign-in | Planned, not offered by the current login UI. It is not an existing usable sign-in method. |
| Store release | Signed release bundle, account/testing/listing declarations and final device tests remain. The previously empty release checklist is now populated. |

General photo-post likes and post-caption editing are additional product features,
not implemented capabilities to advertise. Original recipe-author hearts and post
deletion/reporting already exist.

## Technical follow-ups

1. The main web chunk still exceeds Vite's advisory 500kB threshold. Split major
   screens/editors into deliberate route chunks in a separate performance pass.
   The existing mixed static/dynamic import warnings for post drafts/push are
   not build failures; imports alone do not provide lazy loading when another
   path imports the same module eagerly.
2. `admin_analytics_overview` and `log_search_event` exist live but are absent from
   the checked-in migration baseline. Capture the legacy database baseline before
   treating migrations as a complete fresh-project bootstrap. The analytics RPC
   still computes the hidden/unused `recent_activity` response; remove that only
   with an intentional versioned server contract change.
3. Supabase reports leaked-password protection disabled. Review/enable that Auth
   setting if available for the project's plan. No Auth configuration was changed.
4. The admin analytics SECURITY DEFINER advisory is intentional but merits ongoing
   review: its live body checks `private.is_admin()`, has an empty search path,
   denies anonymous execute and rejected a synthetic non-admin caller. Private
   helper tables flagged INFO for RLS without policies are deliberately inaccessible
   directly; adding permissive policies just to silence the advisor would be wrong.

## Verification

- 314 tests pass; TypeScript and source formatting checks pass.
- Web build, Android sync and JDK 21 offline debug APK build pass.
- Pixel 7/API 36 emulator: APK installation, Home layout/carousel inset, public
  profile/menu navigation and representative light/dark layouts checked.
- Synthetic non-admin analytics permission test passed and rolled back; no user
  rows, messages, notifications, emails or published content were created.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

Related: [Android callbacks/links](native-android-auth-links.md),
[release checklist](google-play-release-checklist.md),
[existing feature review](feature-gap-review-2026-10-19.md).
