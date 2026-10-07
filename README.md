# Pickle

Responsive recipe app built with React, TypeScript, Vite, and Supabase.
Production: https://getpickleapp.com

## Development

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
