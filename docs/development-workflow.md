# Developing Pickle with Codex

Keep Pickle's existing stack: React, TypeScript, Vite, Tailwind, Supabase,
and Capacitor Android. Codex is the implementation tool; VS Code is useful for
reading files and making manual changes. The product direction and development
roadmap remain the source of scope, and `AGENTS.md` records repository guidance.

## Start a local session

Use Node.js 24 to match `.github/workflows/checks.yml`. In a new checkout:

```powershell
Set-Location C:\Users\dinei\Projects\pickle
npm ci
```

Create an ignored `.env.local` using the URL and publishable key for the intended
development Supabase project. Follow the variable names in README.md. The local
web server does not create an isolated database: verify which project it targets
before testing saves, uploads, messages, deletion, or notifications.

```powershell
npm run dev -- --host 127.0.0.1
```

Open the local URL Vite prints. Ask Codex to exercise the affected flow using its
built-in browser. Keep one feature or bug per chat, and give it a concrete user
outcome and acceptance criteria. For larger changes, copy
`docs/templates/feature-brief.md` to a feature-specific document in `docs/`.

## A useful Pickle task

Example prompt (illustrative requirements, not an approved roadmap item):

> Read AGENTS.md and the saved-recipe feature documentation. Inspect the existing
> implementation before changing it. Improve the saved-recipe empty state so a
> user can return to discovering recipes. Preserve saved-list filters and existing
> navigation. Verify the empty and populated states at mobile and desktop sizes
> in both themes. Run the relevant regression tests, format check, and build.
> Review the diff and report what was actually verified.

Work through: inspect -> small plan -> implement one complete flow -> verify ->
review -> checkpoint. If a feature already exists, improve or connect it instead
of building a parallel implementation.

## Verification layers

| Layer | How to check | What it establishes |
| --- | --- | --- |
| Node tests | `npm test` | Existing helper, component, and mocked behavior tests |
| Formatting | `npm run format:check` | Source formatting matches the formatter |
| TypeScript and bundle | `npm run build` | Types and web compilation pass |
| Browser | Built-in browser; mobile/desktop and affected themes | Actual navigation, layout, errors, and runtime behavior |
| Database | Relevant `tests/*.integration.sql` on a migrated development database | Real RPC, permissions, ownership, and persistence behavior |
| Android | Capacitor sync, native build, emulator/device checks | Native integration behavior |

Run the first three commands before handing off application changes. Run other
layers when the change affects them, and state when access or prerequisites are
missing. Passing compilation or mocked tests does not establish that the live
backend, Google login, push delivery, or Android integrations work.

Account-cache regression checks include both new-recipe drafts
(`pickle:recipe-new:<account>`) and existing recipe drafts. Deletion cleanup must
remove both for the selected account, preserve other accounts' keys, and report
storage failures so the UI can show its existing cleanup warning. See
`tests/account-cache.test.mjs`.

Useful end-to-end journeys to verify on development accounts:

- Discover a recipe -> open it -> save it -> reload -> find it in Saved.
- Write a recipe/post draft -> leave -> reopen -> confirm recovery.
- Share a cooking experience -> confirm its link to the original recipe.
- Comment/reply -> open the recipient's notification -> reach the exact content.
- Switch accounts -> confirm drafts, saved items, and private data stay scoped.

For Android changes, follow `android-setup.md`. On Windows:

```powershell
npm run android:sync
Push-Location android
try { .\gradlew.bat assembleDebug } finally { Pop-Location }
```

A browser viewport is not an Android device test. Check affected Back navigation,
keyboard, OAuth links, permissions, push, sharing, or cooking wake locks separately.

## Review and GitHub checks

The added `Pickle checks` workflow runs formatting, Node tests, and the production
build for pull requests, main-branch pushes, and manual runs. It has read-only
repository permissions and requires no database secrets. It does not deploy or
publish its compiled bundle. GitHub execution still needs to be verified after
the workflow and its source dependencies are committed and pushed.

After a successful first run, configure the default branch's ruleset to require
the `Web checks` check before merging, if supported by the repository's plan and
settings. This repository file does not configure that remote rule.

Inspect `git status` before committing. Keep local diagnostic artifacts and content
review exports out of application commits. Stage specific intended files.
Avoid `git add .`. Worktrees start from committed state,
so create a deliberate source checkpoint before using one for feature work that
depends on these changes. Never reset or stash another task's work automatically.

For review, ask a fresh chat or an optional second agent:

> Review this scoped diff against its acceptance criteria. Look for reproducible
> regressions in loading, retries, draft recovery, account switching, access control,
> and mobile/native navigation where relevant. Report file locations and impact.
> Do not modify files.

## Add integrations only when needed

- Use the connected GitHub, Supabase, and Vercel tools when available. Prefer
  project-scoped, read-only database inspection before planning writes. Never run
  fixture scripts against production as a development check.
- Context7 is optional for version-specific library docs; official documentation
  and connected documentation tools can serve this role already. Follow the
  current client instructions rather than adding duplicate servers globally.
- Start browser verification with Codex's built-in browser. If a CLI workflow needs
  another integration, Microsoft provides Playwright CLI plus skills. Browser
  automation and Playwright Test regression suites serve different purposes.
- Playwright Test is not installed in this repository yet. Introduce it with a
  first isolated, repeatable flow and development fixtures; only then add it to CI.
  Authenticated tests need development accounts and a defined cleanup strategy.
- Superpowers, OpenSpec, and a second paid coding agent are optional. Start with
  the repository instructions and feature brief before introducing more process.

No account connections, global MCP configuration, paid subscriptions, production
changes, or branch protection settings are installed by these repository files.

## Reference documentation

- [OpenAI development best practices](https://learn.chatgpt.com/guides/best-practices)
- [Context7 client setup](https://github.com/upstash/context7)
- [Playwright CLI and its comparison with MCP](https://github.com/microsoft/playwright-cli)
- [Playwright Test](https://playwright.dev/docs/intro)
- [Supabase MCP project scoping](https://supabase.com/docs/guides/ai-tools/mcp)
- [GitHub setup-node action](https://github.com/actions/setup-node)
