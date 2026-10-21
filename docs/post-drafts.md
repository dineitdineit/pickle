# Recoverable photo-post drafts

Implemented 2026-10-20. One device-local draft per authenticated account, using IndexedDB metadata and separate Blob assets. No server schema change or new cloud provider.

## User flow

- Opening Post checks local storage before opening the gallery. A saved draft offers **Resume draft**, **Discard & start new**, or **Not now**.
- Photos, photo order, cropped file and reset source, filters/adjustments/text overlays, caption, recipe tag and editor position save after 250 ms of inactivity. The saved status appears only after a successful transaction.
- **Save & close**, navigation/unmount, page hiding and Android pause flush the latest state. Android Back moves to the preceding editor step, then saves and closes. Imports and crop operations must finish before they can be saved.
- **Discard draft** asks for confirmation and removes local photos and metadata. Sharing clears the local draft after server confirmation. Stable post/photo identifiers preserve existing upload idempotency. A resumed draft with an interrupted Share checks whether that post was already published before restoring editing; failed verification preserves the draft for retry.
- Storage failures offer retry. Continuing without draft saving is explicit, preserves any inaccessible prior draft, and warns before closing with unsaved content.

## Storage boundaries

Drafts expire 30 days after the last successful save; expired metadata and photos across accounts are purged when storage is next opened. Up to 10 sanitized images, each up to 5 MB, with a separate cropped copy where needed. Sliders/caption edits do not rewrite existing image blobs. Removed/replaced image assets are reclaimed atomically with metadata changes. Browser/OS quota can be smaller than the maximum possible draft; transaction failures leave the last confirmed draft intact.

Logout retains the account-scoped draft for later sign-in on the same device. Another account gets its own draft. Account deletion invalidates active writers, broadcasts deletion to other open same-origin windows and awaits local cleanup; failure displays instructions to clear app/site storage. Revision checks prevent another window silently overwriting or discarding newer work.

No cloud synchronization or guarantee against OS/browser storage eviction, uninstall or clearing app data. A process kill before a pending transaction finishes can lose its latest change; confirmed saves remain recoverable. Crop gestures save once Apply completes, not during an unfinished crop dialog. Selected source files already have metadata removed by the existing image preparation path. This build disables Android OS cloud backup/device transfer.

## Verification

`tests/post-drafts.test.mjs` uses IndexedDB transactions through fake-indexeddb for binary file recovery, image reuse/reclamation, owner isolation, concurrent editor conflicts, aborted transactions, discard races, expiry and account deletion. `tests/post-draft-recovery.test.mjs` covers recovery, debounced/lifecycle saves, storage failures and interrupted-share confirmation.

Native acceptance: select photos → edit/crop → caption/tag → saved state → Save & close → Resume; background and force-stop/relaunch → Resume; explicit discard → reopen with no draft. Public posting is unnecessary for these checks.

### Native result (2026-10-20)

Debug APK built and installed on the Pixel 7 / API 36 emulator. A selected test screenshot, applied crop, image adjustment, caption and Chicken Adobo recipe tag were retained after Save & close, an APK update and force-stop/relaunch. Resume returned to the caption stage; the tag/caption/photo remained available, and the image adjustment was present in the editor. Explicit discard prompted for confirmation; reopening Post then opened the gallery and an empty composer instead of recovery. Temporary draft was removed; no post was published. The crop viewport was bounded to keep actions reachable for tall images. All 292 automated tests passed, including 14 draft storage/recovery tests. Physical-device OS eviction and sudden power loss remain outside this emulator check.

