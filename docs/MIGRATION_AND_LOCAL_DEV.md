# EL MATBA5 — Production Database, Migration & Security Operations Guide

## Architecture Summary

EL MATBA5 uses **Supabase Auth** + **Supabase PostgreSQL** + **Row Level Security (RLS)** with only the Supabase Project URL (`SUPABASE_URL`) and Publishable Key (`SUPABASE_PUBLISHABLE_KEY`). No `SUPABASE_SECRET_KEY` or legacy `service_role` key is used anywhere in the codebase.

- **Browser:** Authenticates via Supabase Auth (PKCE flow), holds the user session, and sends `Authorization: Bearer <access_token>` to the Express backend.
- **Backend (`server.ts` + `src/server/`):** Validates every incoming Bearer token through `supabase.auth.getUser(token)` and creates a stateless request-scoped Supabase client configured with that user's token so PostgreSQL RLS enforces `organization_id` isolation on every query.
- **No silent SQLite fallback:** Production fails closed if `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, or `SESSION_SECRET` are missing or invalid. `node:sqlite` is never initialized at server startup.

---

## 1. Ordered PostgreSQL Migrations

Do **not** delete or squash `0001_initial_schema.sql`. Migrations are ordered and additive:

1. `supabase/migrations/20261120160601_0001_initial_schema.sql` — Base multi-tenant schema, reference registries, initial RPCs, and RLS policies.
2. `supabase/migrations/20261120160604_0002_phase_2a1_security_hardening.sql` — Phase 2A.1 security and reliability hardening:
   - Enforces verified email and parent organization row locking (`FOR UPDATE`) during team quota checks in `accept_organization_invitation`.
   - Tightens `UPDATE` and `DELETE` RLS policies on `project_market_targets` and `project_competitors` to require parent-project `organization_id` matching on both `USING` and `WITH CHECK`, plus `BEFORE UPDATE` immutability triggers (`prevent_cross_org_reassignment`) preventing cross-organization moves even for dual-org users.
   - Replaces non-atomic onboarding with `complete_onboarding_atomic` (`SECURITY DEFINER`, fixed `search_path`, `EXECUTE` granted strictly to `authenticated`), creating organization, owner membership, `usage_records`, project, validated market targets, competitors, and audit logs in a single transaction.
   - Enforces a deliberate transactional organization-creation limit (`public.max_owned_organizations_default()` = **3 owned organizations per user**) using `pg_advisory_xact_lock(hashtext('org_create:' || auth.uid()::text))` inside both `create_organization_atomic` and `complete_onboarding_atomic`.
3. `supabase/migrations/20261120160607_0003_strict_email_confirmation.sql` — Phase 2A.1.1 strict email confirmation correction:
   - Replaces `public.accept_organization_invitation(p_raw_token)` so it strictly checks `auth.users.email_confirmed_at IS NOT NULL` (never substituting `COALESCE(email_confirmed_at, confirmed_at)` which can be populated by phone/non-email auth).
   - Adds `public.phase_2a1_1_strict_email_confirmation_ready()` (`EXECUTE` granted to `authenticated`) so integration tests can independently verify migration `0003` readiness.
4. `supabase/migrations/20261120160906_0004_function_permission_hardening.sql` — Phase 2A.1.2 function `EXECUTE` permission hardening:
   - Revokes `PUBLIC` and `anon` `EXECUTE` across all public RPCs and helper functions, and restricts internal/trigger helpers (`handle_new_user`, `max_owned_organizations_default`, `prevent_cross_org_reassignment`, `rls_auto_enable`) away from `authenticated`.
5. `supabase/migrations/20261120202600_0005_phase_2a3_security_and_performance.sql` — Phase 2A.3 / 2A.3.1 security remediation & performance optimization:
   - **Performance (Indexes):** Adds 7 justified FK covering indexes (`audit_logs.actor_user_id`, `organization_invitations.accepted_by`, `organization_invitations.invited_by`, `organizations.created_by`, `organizations.plan_id`, `projects.created_by`, `projects.primary_country_code`) and drops 1 genuinely redundant index (`idx_org_members_org`, already covered by `UNIQUE(organization_id, user_id)`). Retains the other 6 indexes and omits low-selectivity lookup FKs on `project_market_targets` and `provider_coverage`.
   - **Performance (RLS InitPlans):** Rewrites all 5 flagged RLS policies (`profiles_insert_self`, `profiles_update_self`, `org_invitations_insert_admin`, `audit_logs_insert_member`, `projects_insert_analyst`) plus RLS helper functions to evaluate `(SELECT auth.uid())` once per statement.
   - **Security Remediation:** Prevents client tampering with `organizations` billing/ownership columns (`plan_id`, `subscription_status`, `created_by`), drops direct client `INSERT`/`UPDATE` policies on `usage_records`, locks `organization_invitations` updates to `pending -> revoked` transitions, protects `profiles` on BOTH `INSERT` and `UPDATE` against `email`/`id` spoofing via authoritative `auth.users` lookup, prevents client `projects.created_by` alteration, requires `actor_user_id = (SELECT auth.uid())` on direct `audit_logs` inserts, enforces `max_projects` quotas atomically via a `BEFORE INSERT` trigger with 64-bit advisory locking and role verification, and implements real schema catalog checks in `phase_2a3_security_perf_ready()`.
6. `supabase/migrations/20261120203100_0006_phase_2a4_auth_profile_email_sync.sql` — Phase 2A.4 Auth email/profile synchronization:
   - Adds a trusted `AFTER UPDATE OF email` trigger on `auth.users` so Auth-managed email changes update `profiles.email` without permitting client-side profile email edits.
   - Uses a private SECURITY DEFINER trigger function, transaction-local sync marker, authoritative `auth.users` lookup in the profile guard, and least-privilege EXECUTE grants.
   - Adds `phase_2a4_profile_email_sync_ready()` for an explicit catalog-based readiness check.

### Clean Install (Fresh Supabase Project)

1. Ensure Supabase Email Auth and site/redirect URLs are configured.
2. **Option A — Supabase Dashboard SQL Editor:**
   - Run all six timestamped migration files in `supabase/migrations/` in ascending version order.
3. **Option B — Supabase CLI:**
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push --remote --dry-run
   # Review the planned migrations. Only after explicit production approval:
   supabase db push --remote --yes
   ```
   Supabase CLI v3 targets the local stack by default; `--remote` is required for hosted databases. Never run the final command until the migration plan, backup, and rollback procedure have been reviewed.
4. Verify `Authentication -> URL Configuration`:
   - Set **Site URL** to your `APP_URL` (e.g. `http://localhost:3000` in dev or your Cloud Run service URL).
   - Add `<APP_URL>/**` to **Redirect URLs** for PKCE sign-up confirmation and password recovery.

### Upgrading an Existing Database (Where `0001`–`0004` Already Ran)

- **Prerequisites & Backup:** Take a logical or physical backup before upgrading (`supabase db dump --remote -f pre-phase-2a-backup.sql` or Supabase Dashboard backup).
- **Apply candidates only after validation and explicit approval:** Apply `20261120202600_0005_phase_2a3_security_and_performance.sql` and then `20261120203100_0006_phase_2a4_auth_profile_email_sync.sql` in order. They are not yet applied to production. Do not apply either until the isolated local PostgreSQL/RLS suite passes and a production backup/rollback plan is ready.
- **Rollback Considerations:**
  - If existing customer accounts already own more than 3 organizations before applying `0002`, existing ownership rows remain intact (only *new* creations check the limit), or `public.max_owned_organizations_default()` can be adjusted in a follow-up migration.
  - To revert `0005`/ `0006` safely, restore the pre-migration snapshot or use a reviewed forward-fix migration; do not edit migration history or drop tenant tables.

---

## 2. Organization-Creation Limit Policy Rationale

In `0001_initial_schema.sql`, commercial plans (`public.plans`) attach to `organizations.plan_id` rather than user accounts, and `plans` does not define a `max_organizations` column yet. Until Phase 6 introduces account-level Paymob billing/workspace tiers, EL MATBA5 enforces a deliberate transactional safety limit of **3 owned organizations per authenticated user** (`MAX_OWNED_ORGANIZATIONS_DEFAULT = 3` / `public.max_owned_organizations_default()`). This preserves Settings -> *Create Additional Organization* for agencies while preventing unlimited workspace abuse and concurrent race bypasses via per-user advisory transaction locks (`pg_advisory_xact_lock`).

---

## 3. Environment Variables & Production Proxy / Rate-Limit Notes

Configure these secrets in Google AI Studio Secrets (or `.env` locally — never commit `.env`):

- `SUPABASE_URL`: Your Supabase project URL (`https://<ref>.supabase.co`).
- `SUPABASE_PUBLISHABLE_KEY`: Your Supabase Publishable key (`sb_publishable_...` or anon public key — `sb_secret_` and legacy `service_role` JWTs are rejected at startup).
- `SESSION_SECRET`: Random string of at least 32 characters (required in production).
- `APP_URL`: Deployed origin (used for CORS and auth redirect URL validation).
- `CORS_ORIGIN`: Optional comma-separated additional allowed origins.
- `TRUST_PROXY`: Express reverse-proxy trust setting. **Defaults to `false`** so arbitrary `X-Forwarded-For` headers cannot be spoofed to bypass IP rate limits. Set `TRUST_PROXY="1"` only when deployed behind a single trusted reverse proxy (e.g., Google Cloud Run / Nginx).

### Distributed Rate Limiting Limitation

The default `InMemoryRateLimitStore` in `src/server/middleware/security.ts` stores bounded rate-limit buckets **per Node.js process** and is **not shared across multiple containers or autoscaled instances**. All mutating, export, and market-resolution endpoints (`/api/onboarding`, `/api/organizations`, `/api/organizations/:orgId/invitations`, `/api/invitations/accept`, `/api/organizations/:orgId/projects`, `/api/organizations/:orgId/gdpr-export`, `/api/markets/resolve`, `/api/contact`) already use the async-capable `RateLimitStore` abstraction (`Promise<RateLimitResult> | RateLimitResult`). For horizontally scaled Cloud Run deployments, replace `InMemoryRateLimitStore` with a shared Redis / Upstash `RateLimitStore` adapter.

---

## 4. Preserving Local Phase 1 SQLite Data (`data/elmatba5.db`)

Phase 1 created a local `data/elmatba5.db` SQLite database in development. Neither Phase 2A nor Phase 2A.3 deletes `data/elmatba5.db`. Reference registries (`countries`, `languages`, `search_engines`, `provider_coverage`, `plans`) are seeded idempotently by `supabase/migrations/20261120160601_0001_initial_schema.sql`. If you need to export Phase 1 local SQLite records manually, run `sqlite3 data/elmatba5.db ".dump" > backup.sql`.

---

## 5. Free Local PostgreSQL & RLS Verification

The repository uses timestamp-prefixed migration filenames so Supabase CLI can apply them in order. The first four timestamps match the migration versions already recorded by the production project; the fifth migration is a new, unapplied candidate.

Run the complete stack locally without linking it to production:

```bash
npm install
supabase start -x studio,imgproxy,edge-runtime,logflare,vector
supabase db reset
```

Configure the test process from the local stack output (never use production credentials):

```bash
supabase status -o env > /tmp/elmatba5-supabase.env
set -a
source /tmp/elmatba5-supabase.env
set +a
export TEST_SUPABASE_URL="$API_URL"
export TEST_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
export TEST_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export TEST_SUPABASE_JWT_SECRET="$JWT_SECRET"
npm run lint
npm test
npm run build
supabase stop --no-backup
```

The test-only service role key and JWT secret are used exclusively by the isolated test runner to provision and clean up synthetic users and to exercise unconfirmed-email authorization. They must never be configured in the application runtime or committed to Git. The GitHub Actions workflow runs the same checks against a disposable local Supabase stack and does not connect to the production project.

## 6. Running Verification & Isolated RLS Integration Tests

```bash
npm run lint
npm test
npm run build
```

- `src/lib/marketRules.test.ts` — Pure domain logic tests (market routing, URL/domain normalization, entitlements).
- `src/server/security.test.ts` — Environment validation (including legacy `service_role` JWT guard), `TRUST_PROXY` / bounded rate-limit store eviction, async `RateLimitStore`, UUID validation, strict `email_confirmed_at` enforcement (`isStrictEmailConfirmed`), onboarding input checks, and route auth rejection tests.
- `src/server/rls.integration.test.ts` — Live multi-tenant PostgreSQL + RLS test suite across real authenticated non-privileged Supabase users with granular independent subtests and explicit JSON diagnostics (`credentialsMissing`, `migration0001Missing`..`migration0005Missing`, `emailConfirmationPreventsSessionCreation`, `unconfirmedRpcTestMode`, `executedTests`, `skippedTests`).

### Isolated Unconfirmed-Email PostgreSQL Test Environment (Test Runner Only)

Normal application configuration **never** uses a Supabase Secret / `service_role` key. For CI or a dedicated isolated Supabase test project / local Supabase CLI stack, the test runner optionally accepts **test-only** environment variables to exercise an authenticated user whose `auth.users.email_confirmed_at IS NULL` directly against PostgreSQL `accept_organization_invitation` without leaving orphaned test rows:

- `TEST_SUPABASE_URL` / `TEST_SUPABASE_PUBLISHABLE_KEY` (overrides app `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` so tests run against an isolated project).
- `TEST_UNCONFIRMED_ACCESS_TOKEN` **or** `TEST_SUPABASE_SERVICE_ROLE_KEY` + `TEST_SUPABASE_JWT_SECRET` (creates synthetic `@example.com` users scoped to the test run suffix, mints a short-lived non-privileged `role: 'authenticated'` token for the unconfirmed test user to invoke `accept_organization_invitation`, and cleans up only those synthetic test users/orgs in `finally`).


