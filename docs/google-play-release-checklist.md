# Google Play release checklist

Updated 2026-10-21. An unchecked item is pending or not independently verified;
code existence does not mean the real-device or store requirement has passed.
Verify current Play Console requirements for the actual developer account before
committing a release date. This checklist does not authorize publishing.

## Development validation

- [x] Web build, TypeScript and 314 automated tests pass.
- [x] Source formatting checks pass.
- [x] Capacitor Android sync and debug APK build pass with JDK 21.
- [x] Representative emulator routing, Back and layout checks completed.
- [ ] Repeat the full release-candidate flow on a physical Galaxy and another
      supported screen/device configuration, including light/dark, larger text,
      keyboard, offline/retry, camera/gallery and permission denial.

## Accounts and platform configuration

- [ ] Confirm developer account creation, verification and current testing/access
      requirements in Play Console. Earlier owner status was no developer account.
- [ ] Confirm the final package ID `com.getpickleapp.pickle` before first submission.
- [ ] Configure protected release/upload signing and Play App Signing; keep keys
      and passwords outside the repository. A debug APK is not a store release.
- [ ] Build and install the signed release AAB through the appropriate test track;
      set intentional versionCode/versionName values for each submission.
- [ ] Confirm current Android target/API, supported devices and release manifest.
- [ ] Replace/approve launcher, splash and store artwork; verify branding on device.

## Authentication, links and communication

- [x] Owner confirmed native Supabase redirect allowlist entries were added.
- [ ] Complete Google login, browser cancellation and same-device fresh recovery
      email/password update using the installed release candidate.
- [ ] Publish the correct signed `/.well-known/assetlinks.json` association and
      verify ordinary HTTPS recipe/post links from another app, without adb
      package targeting. See [native setup](native-android-auth-links.md).
- [ ] Validate phone push delivery with two accounts, background/closed app,
      opt-out, sign-out/account switching, blocked users and unavailable content.
- [ ] Validate authentication and moderation service emails in the real inbox,
      including sender/domain configuration and failure/retry handling.

## Product, safety and data

- [ ] Exercise recipe/post publish/edit/delete, drafts and interrupted uploads.
- [ ] Exercise comments/replies, saved cooking states, follows, inbox and blocks.
- [ ] Verify report submission and admin decisions with ordinary/admin accounts,
      including hidden content, author notices and appeal access.
- [ ] Verify account deletion, queued cleanup/retry, receipts and the configured
      retention jobs without using a real user's account as a test fixture.
- [ ] Review deployed legal/contact pages, age/guardian flow, content agreement
      and Data safety declarations against actual providers and data handling.
- [ ] Review Supabase password protection and provider/log/backup settings.
- [ ] Treat Waraeat, guardian AI consent and Apple login as unavailable until their
      implementations and acceptance tests are complete.
- [ ] Do not advertise general post likes or caption editing as existing features.

## Listing and submission

- [ ] Prepare app description, screenshots, icon/feature graphic, category and
      support links that match the release candidate.
- [ ] Complete audience, content rating, access/reviewer instructions, data/privacy
      and account-deletion declarations in the current Play Console workflow.
- [ ] Confirm the countries and rollout scope with the owner, beginning with the
      intended Philippines audience rather than automatically enabling every region.
- [ ] Review test feedback, crashes/startup, permissions and release signing output.
- [ ] Obtain the owner's explicit approval for store submission and rollout.
