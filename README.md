# Pickle

Responsive recipe app built with React, TypeScript, Vite, and Supabase.
Production: https://getpickleapp.com

## Product direction

Read the [Pickle product direction](docs/product-vision.ko.md) before planning features, design changes, or growth initiatives. It records the purpose, initial strategy, and principles established with the founder. Implementation details and budgets are tracked separately.

The [strategy research and proposals](docs/product-strategy-proposal.ko.md) provide supporting context; the product direction document takes precedence.

Follow the [development roadmap](docs/development-roadmap.ko.md) for current scope: recipes and cooking-experience sharing first, with restaurant discovery as a later phase after demand and operational readiness are established.

## Development

For the Codex workflow, feature brief template, browser/device verification, and
GitHub checks, see [Developing Pickle with Codex](docs/development-workflow.md).
Repository instructions for coding agents live in [AGENTS.md](AGENTS.md).

1. Run `npm ci`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. Run `npm run dev`.

## Checks

- `npm run typecheck` — strict TypeScript checks, including unused code.
- `npm test` — time formatting, relationship/image helpers, and auth state handling.
- `npm run format:check` — source formatting.
- `npm run build` — type check and production build.

Use `npm run format -- src vite.config.ts tests` to format source files.

## Code structure

- `App.tsx` handles navigation; `DesktopShell.tsx` supplies the desktop layout.
- `RecipeStrip.tsx` displays the mobile horizontal recipe list.
- `RecipeDetailScreen.tsx` loads recipe data and manages user actions.
- `RecipeSections.tsx` renders ingredients, steps, and nutrition.
- `AdminDashboard.tsx` handles admin access/moderation; `AdminAnalytics.tsx` renders analytics. Admin code loads on demand.
- `profileContent.ts` holds the existing help and legal text.
- `lib/format.ts`, `lib/recipe.ts`, and `lib/auth.ts` hold shared helpers.
- `lib/supabase.ts` initializes the SDK without modifying its methods.

Vercel deploys `main`. Auth redirects use the production domain; Google credentials belong in Supabase's provider configuration.

Recipe free-text entry and the server-side AI connection checklist are documented in [docs/recipe-text-assistant.md](docs/recipe-text-assistant.md). AI calls remain disabled until server-only credentials, a model and the activation setting are configured.
