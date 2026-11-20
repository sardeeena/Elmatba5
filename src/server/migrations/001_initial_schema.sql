-- EL MATBA5 (المطبخ) — Local Relational SQL Schema (SQLite Runtime Mirror of PostgreSQL Schema)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  preferred_locale TEXT NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'ar')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_egp_monthly INTEGER NOT NULL,
  price_usd_monthly INTEGER NOT NULL,
  max_projects INTEGER NOT NULL,
  max_keywords INTEGER NOT NULL,
  max_crawls_monthly INTEGER NOT NULL,
  max_geo_runs_monthly INTEGER NOT NULL,
  max_ai_credits_monthly INTEGER NOT NULL,
  max_team_members INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL CHECK (business_type IN ('agency', 'consultant', 'business', 'ecommerce', 'other')),
  billing_country_code TEXT NOT NULL DEFAULT 'EG',
  plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'starter',
  subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  created_at TEXT NOT NULL,
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS countries (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  region TEXT NOT NULL,
  default_language_code TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS languages (
  code TEXT PRIMARY KEY,
  name_en TEXT NOT NULL,
  name_native TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl'))
);

CREATE TABLE IF NOT EXISTS search_engines (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_coverage (
  id TEXT PRIMARY KEY,
  provider_code TEXT NOT NULL,
  country_code TEXT NOT NULL REFERENCES countries(code),
  search_engine_code TEXT NOT NULL REFERENCES search_engines(code),
  supports_serp INTEGER NOT NULL DEFAULT 0,
  supports_keyword_volume INTEGER NOT NULL DEFAULT 0,
  supports_first_party INTEGER NOT NULL DEFAULT 0,
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('supported', 'partial', 'first_party_only', 'unsupported')),
  notes TEXT NOT NULL,
  UNIQUE (provider_code, country_code, search_engine_code)
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  business_description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  primary_country_code TEXT NOT NULL REFERENCES countries(code),
  business_goals TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_market_targets (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL REFERENCES countries(code),
  language_code TEXT NOT NULL REFERENCES languages(code),
  search_engine_code TEXT NOT NULL REFERENCES search_engines(code),
  device TEXT NOT NULL DEFAULT 'both' CHECK (device IN ('desktop', 'mobile', 'both')),
  assigned_provider TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, country_code, language_code, search_engine_code)
);

CREATE TABLE IF NOT EXISTS project_competitors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (project_id, domain)
);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_ym TEXT NOT NULL,
  keywords_tracked INTEGER NOT NULL DEFAULT 0,
  crawls_run INTEGER NOT NULL DEFAULT 0,
  geo_runs INTEGER NOT NULL DEFAULT 0,
  ai_credits_used INTEGER NOT NULL DEFAULT 0,
  reports_generated INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, period_ym)
);

CREATE TABLE IF NOT EXISTS contact_leads (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'EG',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(organization_id);
CREATE INDEX IF NOT EXISTS idx_market_targets_org_proj ON project_market_targets(organization_id, project_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id, created_at);
