# Cooking mode

Implemented October 20, 2026 on `capacitor-android-bootstrap`.

## User flow

Open a recipe with cooking steps → **Cook this recipe**. A full-screen dialog keeps the original recipe mounted underneath and restores it on exit. Its own header/footer remain visible while ingredients and instructions scroll. Android Back closes cooking mode through a temporary listener; it does not change the app's other Back behavior.

- Check off ingredients individually, with groups, optional labels and side notes preserved.
- Select any step with the numbered buttons or Previous/Next. Done & next marks the current step complete and advances. Navigation alone does not complete steps. Mark not done reverses completion. All steps complete shows a completion summary.
- Adjust servings from 0.5 to 1,000 when the original serving count is known. Quantities are always derived from original numbers, then formatted using the existing US/Metric conversion and one-decimal rounding. Free-text/missing amounts and to taste/as needed amounts remain unchanged. Instructions, cooking durations and published recipe data are never rewritten. Fractional pieces can result; the cook decides how to divide them. No density-based mass/volume conversion is added.
- Start a timer for any step, using its declared duration where present or an editable duration otherwise. Multiple steps can have independent timers. Pause, resume, reset and clear are available. Deadlines, rather than interval ticks, determine remaining time; switching apps or reopening the mode does not restart a running timer.
- A finished timer appears in the visible timer tray and can play a brief chime after an earlier user gesture unlocked browser audio. **There is no background alarm, push, notification permission or scheduled OS notification.** Sound requires the view to remain open and visible and audio to be available. Users needing a background alarm are directed to the phone Clock. An expired saved timer is displayed on return, without promising an alarm while the app was closed.
- Keep screen awake is optional and defaults off on every opening. Android uses a small registered Capacitor plugin with `FLAG_KEEP_SCREEN_ON`, released on exit/pause/destroy and restored on resume only if still requested. No CPU wake-lock permission is added. Browsers use Screen Wake Lock where supported and show a clear fallback when unavailable or released. Leaving the mode always releases its request.

## Persistence and privacy

`pickle:cooking:<account-or-guest>:<recipe>` stores ingredient/step IDs, active step, serving/unit choices, timer deadlines/paused durations and the last change time. There is no new database table, analytics event, API request or uploaded cooking history. Account namespaces prevent ordinary UI reuse across accounts. The awake preference and audio context are never persisted.

Resume expires after 30 days without a progress change. Expired/malformed local records are removed when cooking mode is opened; this is not a background physical-erasure guarantee while the app is never opened. Recipe-content fingerprint changes invalidate a saved session so edited ingredients/instructions do not inherit outdated completion. Account-deletion cache cleanup removes that account's cooking keys on the current device. Existing OS backup exclusions remain in place. Storage failure leaves cooking usable in memory with a visible warning. Reset session requires confirmation and removes current progress/timers without editing the recipe.

## Verification

`tests/cooking.test.mjs` verifies numeric scaling, free-text/unknown quantities, unchanged source amounts, serving bounds, independent/duplicate/stale completion IDs, changed-recipe invalidation, expiry, account isolation/deletion cleanup, timer validation, elapsed wall-clock time, pauses, resume and concurrent deadlines.

`tests/cooking-wake-lock.test.mjs` verifies native enable/disable ordering during unmount, releasing a browser wake request that resolves late, and unsupported-browser disclosure.

A temporary local fixture in Chrome at 390 × 844 verified ingredient checkoff, serving changes (2 eggs/15 ml → 4 eggs/30 ml), step advance/completion, independent timer completion while viewing another step, pause, close/reopen, and restored completed state. No account login, publication or production data mutation was used. The Android native plugin compiles in the debug APK; real-phone screen-timeout and lifecycle behavior still require a Galaxy/emulator smoke test.

Light/dark layouts and the browser screen-awake status were also checked. The temporary fixture was removed after verification; `screenshots/cooking-mode-2026-10-20.png` records the mobile preview. All 250 automated tests passed in the final verification run. The browser test covers local UI/persistence rather than a newly introduced server boundary, since cooking progress is device-local.

Primary platform guidance checked:
- https://developer.android.com/develop/background-work/background-tasks/awake/screen-on
- https://capacitorjs.com/docs/plugins/tutorial/android-implementation
- https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
