This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Deploying

SyncTrip runs on **Vercel** (Next.js) with **Supabase** (Postgres, Auth, Storage). All environment variables are listed in [`.env.example`](.env.example) — copy it to `.env.local` for local development.

### 1. Two Supabase projects: staging and production

Create two Supabase projects — one for **staging** and one for **production**. Never test against production data.

- **Production:** enable daily backups and **Point-in-Time Recovery (PITR)** (Project Settings → Add-ons / Database → Backups) before launch.
- Schema, RLS policies and the `photos` storage bucket are all created by migrations — create new resources through migrations too, not the dashboard, so both projects stay identical.

### 2. Database migrations

Migrations live in `supabase/migrations/`. Apply them with the Supabase CLI — **never hand-edit the production schema in the dashboard**.

```bash
# Before every migration: run the database tests (RLS etc.) against a local stack
supabase start
supabase db reset        # applies all migrations locally
supabase test db

# Apply to staging first
supabase link --project-ref <staging-project-ref>
supabase db push

# Verify on staging, then apply to production
supabase link --project-ref <production-project-ref>
supabase db push
```

### 3. Vercel environment variables

In Vercel → Project → Settings → Environment Variables, set each variable per environment:

| Variable | Preview | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging project | production project |
| `MAPBOX_TOKEN` | Mapbox token (optional — falls back to Nominatim) | Mapbox token, URL-restricted |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN (optional) | Sentry DSN |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | optional | set to upload source maps |

`NEXT_PUBLIC_*` variables are inlined at build time, so redeploy after changing them.

### 4. Supabase Auth configuration (each project)

- **URL Configuration:** set the Site URL to the environment's domain and add redirect URLs `https://<domain>/**` (production) and `https://*-<team>.vercel.app/**` (staging/previews). Magic links and OAuth return to `/auth/callback`.
- **Custom SMTP:** Supabase's built-in email sender is heavily rate-limited and for testing only. Configure a real SMTP provider (Auth → SMTP Settings) so magic-link emails are delivered reliably, and customise the email templates.
- **Google OAuth:** in Google Cloud Console, publish the OAuth consent screen with the production domain as an authorised domain, the privacy policy URL `https://<domain>/privacy` and the terms URL `https://<domain>/terms`. Add the Supabase callback (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorised redirect URI, then paste the client ID/secret into Supabase → Auth → Providers → Google.

### 5. Sentry

1. Create a Next.js project in Sentry and copy its DSN into `NEXT_PUBLIC_SENTRY_DSN`.
2. For readable stack traces, create an auth token (Settings → Auth Tokens, scope `project:releases`) and set `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` in Vercel. Source maps are only uploaded when `SENTRY_AUTH_TOKEN` is set.
3. With `NEXT_PUBLIC_SENTRY_DSN` unset (local dev, CI) Sentry is a no-op. Config lives in `src/instrumentation.ts`, `src/instrumentation-client.ts`, `sentry.server.config.ts` and `sentry.edge.config.ts`; PII collection is disabled via the `dataCollection` option (Sentry v11's replacement for `sendDefaultPii: false`).

### 6. Before going live

- Fill in the `[placeholders]` in `src/app/privacy/page.tsx` and `src/app/terms/page.tsx` and have them reviewed.
- Run `npm run build` and `npx eslint src` locally (CI does the same).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
