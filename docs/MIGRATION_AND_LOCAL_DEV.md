# EL MATBA5 — Phase 2A Migration & Local Development Guide

## Architecture Summary

EL MATBA5 uses **Supabase Auth** + **Supabase PostgreSQL** + **Row Level Security (RLS)** with only the Supabase Project URL (`SUPABASE_URL`) and Publishable Key (`SUPABASE_PUBLISHABLE_KEY`). No `SUPABASE_SECRET_KEY` or legacy `service_role` key is used anywhere in the codebase.

- **Browser:** Authenticates via Supabase Auth (PKCE flow), holds the user session, and sends `Authorization: Bearer <access_token>` to the Express backend.
- **Backend (`server.ts` + `src/server/`):** Validates every incoming Bearer token through `supabase.auth.getUser(token)` and creates a stateless request-scoped Supabase client configured with that user's token so PostgreSQL RLS enforces `organization_id` isolation on every query.
- **No silent SQLite fallback:** Production fails closed if `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, or `SESSION_SECRET` are missing or invalid. `node:sqlite` is never initialized at server startup.

---

## 1. Applying the PostgreSQL Migration to Supabase

The migration file lives at `supabase/migrations/0001_initial_schema.sql`.

### Option A: Supabase Dashboard SQL Editor
1. Open your Supabase project dashboard -> **SQL Editor** -> **New query**.
2. Paste the full contents of `supabase/migrations/0001_initial_schema.sql`.
3. Click **Run**.
4. Verify in **Authentication -> URL Configuration**:
   - Set **Site URL** to your `APP_URL` (e.g., `http://localhost:3000` in dev or your Cloud Run URL).
   - Add `<APP_URL>/**` to **Redirect URLs** so PKCE sign-in and password recovery redirects succeed.

### Option B: Supabase CLI
```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

---

## 2. Environment Variables

Configure these secrets in Google AI Studio Secrets (or `.env` locally — never commit `.env`):

- `SUPABASE_URL`: Your Supabase project URL (`https://<ref>.supabase.co`).
- `SUPABASE_PUBLISHABLE_KEY`: Your Supabase Publishable key (`sb_publishable_...` or anon public key).
- `SESSION_SECRET`: Random string of at least 32 characters (required in production).
- `APP_URL`: Deployed origin (used for CORS and security checks).
- `CORS_ORIGIN`: Optional comma-separated additional allowed origins.

---

## 3. Preserving Local Phase 1 SQLite Data (`data/elmatba5.db`)

Phase 1 created a local `data/elmatba5.db` SQLite database in development. Phase 2A **does not** delete `data/elmatba5.db`. Because Supabase Auth manages real user identities (`auth.users`) and password hashes, Phase 1 local SQLite accounts cannot be imported with raw passwords; users register fresh via Supabase Auth, and reference registries (`countries`, `languages`, `search_engines`, `provider_coverage`, `plans`) are seeded idempotently by `supabase/migrations/0001_initial_schema.sql`.

If you wish to inspect or export local Phase 1 SQLite records manually before removing `data/`, use `sqlite3 data/elmatba5.db ".dump" > backup.sql`.

---

## 4. Running Tests

```bash
npm run lint
npm test
npm run build
```

- `src/lib/marketRules.test.ts` — Pure domain logic tests (market routing & entitlements).
- `src/server/security.test.ts` — Environment validation, invitation token hashing, and middleware auth rejection tests.
- `src/server/rls.integration.test.ts` — Live multi-tenant RLS isolation tests across two authenticated non-privileged Supabase users (skips gracefully with diagnostic notice if live Supabase credentials or applied migration are unavailable in the test environment).
