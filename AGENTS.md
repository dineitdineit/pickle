# Working on Pickle

## Product and architecture

- Read `docs/product-vision.ko.md` and `docs/development-roadmap.ko.md` before planning features. Current scope is recipe discovery, cooking, and sharing food experiences; restaurant discovery is a later phase.
- Keep the existing React 19 + TypeScript + Vite + Tailwind + Supabase + Capacitor architecture. Reuse existing components and helpers before introducing dependencies or frameworks.
- Follow `docs/design-system.md`; shared colors and typography live in `src/index.css`. Check both mobile and desktop layouts and light/dark themes when affected.
- Frontend code lives in `src/`, shared logic in `src/lib/`, native Android code in `android/`, migrations in `supabase/migrations/`, and server functions in `supabase/functions/`.

## Before editing

- Inspect `git status` and the relevant diff. Preserve existing work, including untracked source files. Never stage the whole workspace indiscriminately: it also contains unrelated diagnostic output.
- Read the feature's existing documentation and tests. Reproduce a reported bug before changing behavior where practical.
- For substantial features, use `docs/templates/feature-brief.md` to record observable acceptance criteria, scope, and verification. Small fixes can keep this in the task conversation.
- Use current official documentation for unfamiliar APIs. Use connected documentation tools or Context7 when available, with the installed library version.
- Use one implementation owner per checkout. Separate concurrent implementation work into Git worktrees; uncommitted and untracked files are not automatically included in a new worktree. Do not spawn agents unless requested.

## Development and checks

- Use Node.js 24 for consistency with CI. Install locked dependencies with `npm ci` on a new checkout.
- Browser development: `npm run dev -- --host 127.0.0.1`. Use the local URL Vite prints.
- `npm test` runs the Node test suite in `tests/*.test.mjs`; it does not execute the SQL integration scripts or browser/device tests.
- `npm run format:check` checks `src` and `vite.config.ts`. Format only changed files with `npm run format -- <paths>`.
- `npm run build` runs TypeScript checking and builds the web app. `npm run typecheck` is available for faster iteration.
- Before handing off application changes, run relevant tests and the full checks above as appropriate. Report existing failures separately from new failures.
- For UI changes, exercise the affected flow in the browser at mobile and desktop sizes. Use the built-in browser or an available Playwright integration. A successful build does not verify runtime behavior.
- Update meaningful regression tests for behavior changes. Prefer assertions on user-visible behavior or results over source-text snapshots.

## Supabase and user data

- Browser configuration uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in ignored `.env.local`. Never put service-role keys, provider credentials, or signing keys in frontend code, screenshots, logs, or Git.
- Confirm the target database before queries or writes. Use a development database and test accounts for integration tests; local frontend code can still point to production.
- Keep schema changes in migrations. Read existing migrations and RPC contracts first; verify ownership, cross-account access, RLS, and storage rules for affected data.
- `tests/*.integration.sql` require a suitably migrated database and their individual prerequisites. Never treat `npm test` as proof that these passed.
- Use connected service tools already available before configuring duplicate MCP servers. Scope database access to the intended project and start with read-only inspection.

## Android

- Read `docs/android-setup.md` and relevant native-feature docs for Android work.
- After web changes, `npm run android:sync` rebuilds and copies web assets. On Windows, build with `android/gradlew.bat assembleDebug` from the `android` directory.
- Browser emulation does not verify Android Back, auth callbacks, push, permissions, sharing, keyboard, or wake locks. Test affected native behavior on an emulator/device and report which was used.

## Completion

- Review the scoped diff for regressions and accidental files. Summarize changed behavior, checks actually run, and anything unverified.
- Keep feature docs aligned with the implementation. See `docs/development-workflow.md` for the daily workflow and prompts.
- Deployment, production database changes, and store release are distinct from local development. Follow the user's current authorization and the relevant release checklist.
