# EL MATBA5 — Production Database, Migration & Security Operations Guide

## Architecture Summary

EL MATBA5 uses **Supabase Auth** + **Supabase PostgreSQL** + **Row Level Security (RLS)** with only the Supabase Project URL (`SUPABASE_URL`) and Publishable Key (`SUPABASE_PUBLISHABLE_KEY`). No `SUPABASE_SECRET_KEY` or legacy `service_role` key is used anywhere in the codebase.

- **Browser:** Authenticates via Supabase Auth (PKCE flow), holds the user session, and sends `Authorization: Bearer <access_token>` to the Express backend.
- **Backend (`server.ts` + `src/server/`):** Validates every incoming Bearer token through `supabase.auth.getUser(token)` and creates a stateless request-scoped Supabase client configured with that user's token so PostgreSQL RLS enforces `organization_id` isolation on every query.
- **No silent SQLite fallback:** Production fails closed if `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, or `SESSION_SECRET` are missing or invalid. `node:sqlite` is never initialized at server startup.

---

## 1. Ordered PostgreSQL Migrations

Do **not** delete or squash `0001_initial_schema.sql`. Migrations are ordered and additive:

1. `supabase/migrations/0001_initial_schema.sql` — Base multi-tenant schema, reference registries, initial RPCs, and RLS policies.
2. `supabase/migrations/0002_phase_2a1_security_hardening.sql` — Phase 2A.1 security and reliability hardening:
   - Enforces verified/confirmed email (`auth.users.email_confirmed_at`) in `accept_organization_invitation`, plus parent organization row locking (`FOR UPDATE`) during team quota checks.
   - Tightens `UPDATE` and `DELETE` RLS policies on `project_market_targets` and `project_competitors` to require parent-project `organization_id` matching on both `USING` and `WITH CHECK`, plus `BEFORE UPDATE` immutability triggers (`prevent_cross_org_reassignment`) preventing cross-organization moves even for dual-org users.
   - Replaces non-atomic onboarding with `complete_onboarding_atomic` (`SECURITY DEFINER`, fixed `search_path`, `EXECUTE` granted strictly to `authenticated`), creating organization, owner membership, `usage_records`, project, validated market targets, competitors, and audit logs in a single transaction.
   - Enforces a deliberate transactional organization-creation limit (`public.max_owned_organizations_default()` = **3 owned organizations per user**) using `pg_advisory_xact_lock(hashtext('org_create:' || auth.uid()::text))` inside both `create_organization_atomic` and `complete_onboarding_atomic`.

### Clean Install (Fresh Supabase Project)

1. Ensure Supabase Email Auth and site/redirect URLs are configured.
2. **Option A — Supabase Dashboard SQL Editor:**
   - Run the full contents of `supabase/migrations/0001_initial_schema.sql`.
   - Run the full contents of `supabase/migrations/0002_phase_2a1_security_hardening.sql`.
3. **Option B — Supabase CLI:**
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
4. Verify `Authentication -> URL Configuration`:
   - Set **Site URL** to your `APP_URL` (e.g. `http://localhost:3000` in dev or your Cloud Run service URL).
   - Add `<APP_URL>/**` to **Redirect URLs** for PKCE sign-up confirmation and password recovery.

### Upgrading an Existing Database (Where `0001` Already Ran)

- **Prerequisites & Backup:** Take a logical or physical backup before upgrading (`supabase db dump` or Supabase Dashboard backup).
- **Apply `0002`:** Run `supabase/migrations/0002_phase_2a1_security_hardening.sql` in the SQL Editor or via `supabase db push`. It uses `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, and `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` so it applies cleanly and idempotently on top of `0001`.
- **Rollback Considerations:**
  - If existing customer accounts already own more than 3 organizations before applying `0002`, existing ownership rows remain intact (only *new* creations check the limit), or `public.max_owned_organizations_default()` can be adjusted in a follow-up migration.
  - To revert `0002` policies/functions safely, restore the pre-migration snapshot or re-apply the specific `0001` function/policy definitions without dropping tenant tables.

---

## 2. Organization-Creation Limit Policy Rationale

In `0001_initial_schema.sql`, commercial plans (`public.plans`) attach to `organizations.plan_id` rather than user accounts, and `plans` does not define a `max_organizations` column yet. Until Phase 6 introduces account-level Paymob billing/workspace tiers, EL MATBA5 enforces a deliberate transactional safety limit of **3 owned organizations per authenticated user** (`MAX_OWNED_ORGANIZATIONS_DEFAULT = 3` / `public.max_owned_organizations_default()`). This preserves Settings -> *Create Additional Organization* for agencies while preventing unlimited workspace abuse and concurrent race bypasses via per-user advisory transaction locks (`pg_advisory_xact_lock`).

---

## 3. Environment Variables & Production Proxy / Rate-Limit Notes

Configure these secrets in Google AI Studio Secrets (or `.env` locally — never commit `.env`):

- `SUPABASE_URL`: Your Supabase project URL (`https://<ref>.supabase.co`).
- `SUPABASE_PUBLISHABLE_KEY`: Your Supabase Publishable key (`sb_publishable_...` or anon public key).
- `SESSION_SECRET`: Random string of at least 32 characters (required in production).
- `APP_URL`: Deployed origin (used for CORS and auth redirect URL validation).
- `CORS_ORIGIN`: Optional comma-separated additional allowed origins.
- `TRUST_PROXY`: Express reverse-proxy trust setting. **Defaults to `false`** so arbitrary `X-Forwarded-For` headers cannot be spoofed to bypass IP rate limits. Set `TRUST_PROXY="1"` only when deployed behind a single trusted reverse proxy (e.g., Google Cloud Run / Nginx).

### Distributed Rate Limiting Limitation

The default `InMemoryRateLimitStore` in `src/server/middleware/security.ts` stores rate-limit windows **per Node.js process** and is **not shared across multiple containers or autoscaled instances**. Sensitive endpoints (`/api/onboarding`, `/api/organizations`, `/api/organizations/:orgId/invitations`, `/api/invitations/accept`, `/api/contact`) already use the async-capable `RateLimitStore` abstraction (`Promise<RateLimitResult> | RateLimitResult`). For horizontally scaled production deployments, replace `InMemoryRateLimitStore` with a shared Redis / Upstash `RateLimitStore` adapter.

---

## 4. Preserving Local Phase 1 SQLite Data (`data/elmatba5.db`)

Phase 1 created a local `data/elmatba5.db` SQLite database in development. Neither Phase 2A nor Phase 2A.1 deletes `data/elmatba5.db`. Reference registries (`countries`, `languages`, `search_engines`, `provider_coverage`, `plans`) are seeded idempotently by `supabase/migrations/0001_initial_schema.sql`. If you need to export Phase 1 local SQLite records manually, run `sqlite3 data/elmatba5.db ".dump" > backup.sql`.

---

## 5. Running Verification & Tests

```bash
npm run lint
npm test
npm run build
```

- `src/lib/marketRules.test.ts` — Pure domain logic tests (market routing, URL/domain normalization, entitlements).
- `src/server/security.test.ts` — Environment validation, `TRUST_PROXY` / anti-spoofing rate limits, async `RateLimitStore`, confirmed-email invite gate, onboarding input checks, and route auth rejection tests.
- `src/server/rls.integration.test.ts` — Live multi-tenant PostgreSQL + RLS tests across real authenticated non-privileged Supabase users covering Tasks 1–5 (skips cleanly with explicit diagnostic reason if live Supabase credentials or migrations `0001`+`0002` are unavailable in the shell).
