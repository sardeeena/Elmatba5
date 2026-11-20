-- EL MATBA5 (المطبخ) — Production PostgreSQL Schema (Supabase / Cloud SQL Compatible)
-- Migration: 0001_initial_schema.sql
-- Multi-tenant architecture with organization_id isolation and Row Level Security (RLS)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Identity & Tenancy
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  preferred_locale TEXT NOT NULL DEFAULT 'en' CHECK (preferred_locale IN ('en', 'ar')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY, -- 'starter', 'pro', 'agency'
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
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT NOT NULL CHECK (business_type IN ('agency', 'consultant', 'business', 'ecommerce', 'other')),
  billing_country_code TEXT NOT NULL DEFAULT 'EG',
  plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'starter',
  subscription_status TEXT NOT NULL DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled')),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'analyst', 'viewer')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Global Markets & Provider Coverage Registry
CREATE TABLE countries (
  code TEXT PRIMARY KEY, -- ISO-3166-1 alpha-2 ('EG', 'SA', 'AE', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL', 'RU')
  name_en TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  region TEXT NOT NULL,
  default_language_code TEXT NOT NULL
);

CREATE TABLE languages (
  code TEXT PRIMARY KEY, -- 'ar', 'en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'ru'
  name_en TEXT NOT NULL,
  name_native TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl'))
);

CREATE TABLE search_engines (
  code TEXT PRIMARY KEY, -- 'google', 'yandex', 'bing'
  name TEXT NOT NULL
);

CREATE TABLE provider_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code TEXT NOT NULL, -- 'dataforseo', 'gsc', 'yandex_search_api', 'yandex_webmaster', 'bing_webmaster'
  country_code TEXT NOT NULL REFERENCES countries(code),
  search_engine_code TEXT NOT NULL REFERENCES search_engines(code),
  supports_serp BOOLEAN NOT NULL DEFAULT FALSE,
  supports_keyword_volume BOOLEAN NOT NULL DEFAULT FALSE,
  supports_first_party BOOLEAN NOT NULL DEFAULT FALSE,
  coverage_status TEXT NOT NULL CHECK (coverage_status IN ('supported', 'partial', 'first_party_only', 'unsupported')),
  notes TEXT NOT NULL,
  UNIQUE (provider_code, country_code, search_engine_code)
);

-- 3. Projects & Multi-Market Targets
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL,
  business_description TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  target_audience TEXT NOT NULL DEFAULT '',
  primary_country_code TEXT NOT NULL REFERENCES countries(code),
  business_goals TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE project_market_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL REFERENCES countries(code),
  language_code TEXT NOT NULL REFERENCES languages(code),
  search_engine_code TEXT NOT NULL REFERENCES search_engines(code),
  device TEXT NOT NULL DEFAULT 'both' CHECK (device IN ('desktop', 'mobile', 'both')),
  assigned_provider TEXT NOT NULL,
  coverage_status TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, country_code, language_code, search_engine_code)
);

CREATE TABLE project_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, domain)
);

-- 4. Commercial Usage & Leads
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_ym TEXT NOT NULL, -- 'YYYY-MM'
  keywords_tracked INTEGER NOT NULL DEFAULT 0,
  crawls_run INTEGER NOT NULL DEFAULT 0,
  geo_runs INTEGER NOT NULL DEFAULT 0,
  ai_credits_used INTEGER NOT NULL DEFAULT 0,
  reports_generated INTEGER NOT NULL DEFAULT 0,
  UNIQUE (organization_id, period_ym)
);

CREATE TABLE contact_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  country_code TEXT NOT NULL DEFAULT 'EG',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant Isolation Indexes
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_market_targets_org_proj ON project_market_targets(organization_id, project_id);
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id, created_at DESC);

-- Row Level Security (Supabase Production Readiness)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_market_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_projects ON projects
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_isolation_market_targets ON project_market_targets
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tenant_isolation_competitors ON project_competitors
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );
