import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type {
  AuditLogItem,
  BusinessType,
  CountryOption,
  LanguageOption,
  Locale,
  OrganizationInvitationItem,
  OrganizationMemberItem,
  OrganizationSummary,
  OrgRole,
  PlanDefinition,
  PlanId,
  Project,
  ProjectCompetitor,
  ProjectMarketTarget,
  ProviderCoverageEntry,
  SearchEngineOption,
  UsageSummary,
  User,
} from '../lib/types.ts';
import { resolveMarketProvider } from '../lib/marketRules.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance: DatabaseSync | null = null;

export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) {
    return dbInstance;
  }

  const dbPath =
    customPath ??
    process.env.ELMATBA5_DB_PATH ??
    path.resolve(process.cwd(), 'data', 'elmatba5.db');

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  const migrationPath = path.resolve(__dirname, 'migrations', '001_initial_schema.sql');
  const schemaSql = fs.readFileSync(migrationPath, 'utf8');
  db.exec(schemaSql);

  seedReferenceData(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

function seedReferenceData(db: DatabaseSync): void {
  const existingCountries = db.prepare('SELECT COUNT(*) as cnt FROM countries').get() as {
    cnt: number;
  };
  if (existingCountries.cnt === 0) {
    const insertCountry = db.prepare(
      'INSERT INTO countries (code, name_en, name_ar, region, default_language_code) VALUES (?, ?, ?, ?, ?)'
    );
    const countries: Array<[string, string, string, string, string]> = [
      ['EG', 'Egypt', 'مصر', 'MENA', 'ar'],
      ['SA', 'Saudi Arabia', 'المملكة العربية السعودية', 'MENA', 'ar'],
      ['AE', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'MENA', 'ar'],
      ['GB', 'United Kingdom', 'المملكة المتحدة', 'Europe', 'en'],
      ['DE', 'Germany', 'ألمانيا', 'Europe', 'de'],
      ['FR', 'France', 'فرنسا', 'Europe', 'fr'],
      ['ES', 'Spain', 'إسبانيا', 'Europe', 'es'],
      ['IT', 'Italy', 'إيطاليا', 'Europe', 'it'],
      ['NL', 'Netherlands', 'هولندا', 'Europe', 'nl'],
      ['PL', 'Poland', 'بولندا', 'Europe', 'pl'],
      ['RU', 'Russia', 'روسيا', 'Eurasia', 'ru'],
    ];
    for (const row of countries) insertCountry.run(...row);
  }

  const existingLangs = db.prepare('SELECT COUNT(*) as cnt FROM languages').get() as { cnt: number };
  if (existingLangs.cnt === 0) {
    const insertLang = db.prepare(
      'INSERT INTO languages (code, name_en, name_native, direction) VALUES (?, ?, ?, ?)'
    );
    const langs: Array<[string, string, string, 'ltr' | 'rtl']> = [
      ['ar', 'Arabic', 'العربية', 'rtl'],
      ['en', 'English', 'English', 'ltr'],
      ['de', 'German', 'Deutsch', 'ltr'],
      ['fr', 'French', 'Français', 'ltr'],
      ['es', 'Spanish', 'Español', 'ltr'],
      ['it', 'Italian', 'Italiano', 'ltr'],
      ['nl', 'Dutch', 'Nederlands', 'ltr'],
      ['pl', 'Polish', 'Polski', 'ltr'],
      ['ru', 'Russian', 'Русский', 'ltr'],
    ];
    for (const row of langs) insertLang.run(...row);
  }

  const existingEngines = db.prepare('SELECT COUNT(*) as cnt FROM search_engines').get() as {
    cnt: number;
  };
  if (existingEngines.cnt === 0) {
    const insertEngine = db.prepare('INSERT INTO search_engines (code, name) VALUES (?, ?)');
    insertEngine.run('google', 'Google');
    insertEngine.run('yandex', 'Yandex');
    insertEngine.run('bing', 'Bing');
  }

  const existingCoverage = db.prepare('SELECT COUNT(*) as cnt FROM provider_coverage').get() as {
    cnt: number;
  };
  if (existingCoverage.cnt === 0) {
    const insertCov = db.prepare(
      `INSERT INTO provider_coverage
       (id, provider_code, country_code, search_engine_code, supports_serp, supports_keyword_volume, supports_first_party, coverage_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const googleMarkets = ['EG', 'SA', 'AE', 'GB', 'DE', 'FR', 'ES', 'IT', 'NL', 'PL'];
    for (const cc of googleMarkets) {
      insertCov.run(
        crypto.randomUUID(),
        'dataforseo',
        cc,
        'google',
        1,
        1,
        0,
        'supported',
        'Google SERP, keyword volumes, and competitor metrics via DataForSEO.'
      );
      insertCov.run(
        crypto.randomUUID(),
        'gsc',
        cc,
        'google',
        0,
        0,
        1,
        'first_party_only',
        'Authorized first-party Google Search Console clicks, impressions, and queries.'
      );
      insertCov.run(
        crypto.randomUUID(),
        'bing_webmaster',
        cc,
        'bing',
        0,
        0,
        1,
        'first_party_only',
        'Authorized first-party Bing Webmaster Tools REST API metrics.'
      );
    }
    insertCov.run(
      crypto.randomUUID(),
      'yandex_search_api',
      'RU',
      'yandex',
      1,
      0,
      0,
      'partial',
      'Russian Yandex SERP observations via Yandex Search API. Third-party Yandex keyword volumes are not assumed.'
    );
    insertCov.run(
      crypto.randomUUID(),
      'yandex_webmaster',
      'RU',
      'yandex',
      0,
      0,
      1,
      'first_party_only',
      'First-party Russian website diagnostics and search queries via Yandex Webmaster API.'
    );
    insertCov.run(
      crypto.randomUUID(),
      'gsc',
      'RU',
      'google',
      0,
      0,
      1,
      'first_party_only',
      'DataForSEO does not cover Russia; Google data is limited to customer-authorized Search Console.'
    );
  }

  const existingPlans = db.prepare('SELECT COUNT(*) as cnt FROM plans').get() as { cnt: number };
  if (existingPlans.cnt === 0) {
    const insertPlan = db.prepare(
      `INSERT INTO plans
       (id, name, description, price_egp_monthly, price_usd_monthly, max_projects, max_keywords, max_crawls_monthly, max_geo_runs_monthly, max_ai_credits_monthly, max_team_members, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    insertPlan.run(
      'starter',
      'Starter Kitchen',
      'For solo consultants and growing local businesses.',
      1450,
      29,
      2,
      250,
      10,
      30,
      500,
      2
    );
    insertPlan.run(
      'pro',
      'Pro Brigade',
      'For in-house marketing teams targeting multi-country growth.',
      4900,
      99,
      10,
      2000,
      50,
      200,
      3000,
      6
    );
    insertPlan.run(
      'agency',
      'Agency Command',
      'For Egyptian, MENA, and global agencies managing client portfolios.',
      12500,
      249,
      40,
      10000,
      250,
      1000,
      15000,
      25
    );
  }
}

export function currentPeriodYm(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function createUser(
  db: DatabaseSync,
  input: { email: string; passwordHash: string; fullName: string; preferredLocale: Locale }
): User {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name, preferred_locale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.email.toLowerCase(), input.passwordHash, input.fullName, input.preferredLocale, now, now);

  return {
    id,
    email: input.email.toLowerCase(),
    fullName: input.fullName,
    preferredLocale: input.preferredLocale,
    createdAt: now,
  };
}

export function findUserAuthByEmail(
  db: DatabaseSync,
  email: string
): (User & { passwordHash: string }) | null {
  const row = db
    .prepare(
      'SELECT id, email, password_hash, full_name, preferred_locale, created_at FROM users WHERE email = ?'
    )
    .get(email.toLowerCase()) as
    | {
        id: string;
        email: string;
        password_hash: string;
        full_name: string;
        preferred_locale: Locale;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    preferredLocale: row.preferred_locale,
    createdAt: row.created_at,
  };
}

export function findUserById(db: DatabaseSync, userId: string): User | null {
  const row = db
    .prepare('SELECT id, email, full_name, preferred_locale, created_at FROM users WHERE id = ?')
    .get(userId) as
    | {
        id: string;
        email: string;
        full_name: string;
        preferred_locale: Locale;
        created_at: string;
      }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    preferredLocale: row.preferred_locale,
    createdAt: row.created_at,
  };
}

export function updateUserLocale(db: DatabaseSync, userId: string, locale: Locale): void {
  db.prepare('UPDATE users SET preferred_locale = ?, updated_at = ? WHERE id = ?').run(
    locale,
    new Date().toISOString(),
    userId
  );
}

export function createOrganization(
  db: DatabaseSync,
  input: {
    name: string;
    slug: string;
    businessType: BusinessType;
    billingCountryCode: string;
    ownerUserId: string;
  }
): OrganizationSummary {
  const orgId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO organizations (id, name, slug, business_type, billing_country_code, plan_id, subscription_status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'starter', 'trialing', ?, ?, ?)`
    ).run(
      orgId,
      input.name,
      input.slug,
      input.businessType,
      input.billingCountryCode.toUpperCase(),
      input.ownerUserId,
      now,
      now
    );

    db.prepare(
      `INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
       VALUES (?, ?, ?, 'owner', ?)`
    ).run(memberId, orgId, input.ownerUserId, now);

    db.prepare(
      `INSERT INTO usage_records (id, organization_id, period_ym)
       VALUES (?, ?, ?)`
    ).run(crypto.randomUUID(), orgId, currentPeriodYm());

    db.prepare(
      `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
       VALUES (?, ?, ?, 'organization.created', 'organization', ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      orgId,
      input.ownerUserId,
      orgId,
      JSON.stringify({ name: input.name, businessType: input.businessType }),
      now
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    id: orgId,
    name: input.name,
    slug: input.slug,
    businessType: input.businessType,
    billingCountryCode: input.billingCountryCode.toUpperCase(),
    planId: 'starter',
    subscriptionStatus: 'trialing',
    role: 'owner',
    createdAt: now,
  };
}

export function listOrganizationsForUser(db: DatabaseSync, userId: string): OrganizationSummary[] {
  const rows = db
    .prepare(
      `SELECT o.id, o.name, o.slug, o.business_type, o.billing_country_code, o.plan_id, o.subscription_status, m.role, o.created_at
       FROM organizations o
       INNER JOIN organization_members m ON m.organization_id = o.id
       WHERE m.user_id = ?
       ORDER BY o.created_at ASC`
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    slug: string;
    business_type: BusinessType;
    billing_country_code: string;
    plan_id: PlanId;
    subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
    role: OrgRole;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    businessType: r.business_type,
    billingCountryCode: r.billing_country_code,
    planId: r.plan_id,
    subscriptionStatus: r.subscription_status,
    role: r.role,
    createdAt: r.created_at,
  }));
}

export function getOrgMembership(
  db: DatabaseSync,
  organizationId: string,
  userId: string
): { organizationId: string; userId: string; role: OrgRole } | null {
  const row = db
    .prepare(
      'SELECT organization_id, user_id, role FROM organization_members WHERE organization_id = ? AND user_id = ?'
    )
    .get(organizationId, userId) as
    | { organization_id: string; user_id: string; role: OrgRole }
    | undefined;
  if (!row) return null;
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    role: row.role,
  };
}

export function writeAuditLog(
  db: DatabaseSync,
  input: {
    organizationId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  db.prepare(
    `INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    input.organizationId,
    input.actorUserId,
    input.action,
    input.entityType,
    input.entityId ?? null,
    JSON.stringify(input.metadata ?? {}),
    new Date().toISOString()
  );
}

export function getPlanById(db: DatabaseSync, planId: string): PlanDefinition | null {
  const r = db
    .prepare(
      `SELECT id, name, description, price_egp_monthly, price_usd_monthly, max_projects, max_keywords, max_crawls_monthly, max_geo_runs_monthly, max_ai_credits_monthly, max_team_members
       FROM plans WHERE id = ?`
    )
    .get(planId) as
    | {
        id: PlanId;
        name: string;
        description: string;
        price_egp_monthly: number;
        price_usd_monthly: number;
        max_projects: number;
        max_keywords: number;
        max_crawls_monthly: number;
        max_geo_runs_monthly: number;
        max_ai_credits_monthly: number;
        max_team_members: number;
      }
    | undefined;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    priceEgpMonthly: r.price_egp_monthly,
    priceUsdMonthly: r.price_usd_monthly,
    maxProjects: r.max_projects,
    maxKeywords: r.max_keywords,
    maxCrawlsMonthly: r.max_crawls_monthly,
    maxGeoRunsMonthly: r.max_geo_runs_monthly,
    maxAiCreditsMonthly: r.max_ai_credits_monthly,
    maxTeamMembers: r.max_team_members,
  };
}

export function listPlans(db: DatabaseSync): PlanDefinition[] {
  const rows = db
    .prepare(
      `SELECT id, name, description, price_egp_monthly, price_usd_monthly, max_projects, max_keywords, max_crawls_monthly, max_geo_runs_monthly, max_ai_credits_monthly, max_team_members
       FROM plans WHERE is_active = 1 ORDER BY price_usd_monthly ASC`
    )
    .all() as Array<{
    id: PlanId;
    name: string;
    description: string;
    price_egp_monthly: number;
    price_usd_monthly: number;
    max_projects: number;
    max_keywords: number;
    max_crawls_monthly: number;
    max_geo_runs_monthly: number;
    max_ai_credits_monthly: number;
    max_team_members: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    priceEgpMonthly: r.price_egp_monthly,
    priceUsdMonthly: r.price_usd_monthly,
    maxProjects: r.max_projects,
    maxKeywords: r.max_keywords,
    maxCrawlsMonthly: r.max_crawls_monthly,
    maxGeoRunsMonthly: r.max_geo_runs_monthly,
    maxAiCreditsMonthly: r.max_ai_credits_monthly,
    maxTeamMembers: r.max_team_members,
  }));
}

export function getOrgUsage(db: DatabaseSync, organizationId: string): UsageSummary {
  const ym = currentPeriodYm();
  const projectsCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM projects WHERE organization_id = ?')
      .get(organizationId) as { cnt: number }
  ).cnt;
  const membersCount = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM organization_members WHERE organization_id = ?')
      .get(organizationId) as { cnt: number }
  ).cnt;

  let usageRow = db
    .prepare(
      'SELECT keywords_tracked, crawls_run, geo_runs, ai_credits_used, reports_generated FROM usage_records WHERE organization_id = ? AND period_ym = ?'
    )
    .get(organizationId, ym) as
    | {
        keywords_tracked: number;
        crawls_run: number;
        geo_runs: number;
        ai_credits_used: number;
        reports_generated: number;
      }
    | undefined;

  if (!usageRow) {
    db.prepare(
      'INSERT INTO usage_records (id, organization_id, period_ym) VALUES (?, ?, ?)'
    ).run(crypto.randomUUID(), organizationId, ym);
    usageRow = {
      keywords_tracked: 0,
      crawls_run: 0,
      geo_runs: 0,
      ai_credits_used: 0,
      reports_generated: 0,
    };
  }

  return {
    periodYm: ym,
    projectsCount,
    keywordsTracked: usageRow.keywords_tracked,
    crawlsRun: usageRow.crawls_run,
    geoRuns: usageRow.geo_runs,
    aiCreditsUsed: usageRow.ai_credits_used,
    reportsGenerated: usageRow.reports_generated,
    teamMembersCount: membersCount,
  };
}

export function createProject(
  db: DatabaseSync,
  input: {
    organizationId: string;
    createdByUserId: string;
    name: string;
    websiteUrl: string;
    businessDescription: string;
    industry: string;
    targetAudience: string;
    primaryCountryCode: string;
    businessGoals: string;
    marketTargets: Array<{
      countryCode: string;
      languageCode: string;
      searchEngineCode: 'google' | 'yandex' | 'bing';
      device: 'desktop' | 'mobile' | 'both';
    }>;
    competitors: Array<{ domain: string; label?: string }>;
  }
): Project {
  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.exec('BEGIN');
  try {
    db.prepare(
      `INSERT INTO projects
       (id, organization_id, name, website_url, business_description, industry, target_audience, primary_country_code, business_goals, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      projectId,
      input.organizationId,
      input.name,
      input.websiteUrl,
      input.businessDescription,
      input.industry,
      input.targetAudience,
      input.primaryCountryCode.toUpperCase(),
      input.businessGoals,
      input.createdByUserId,
      now,
      now
    );

    const insertTarget = db.prepare(
      `INSERT INTO project_market_targets
       (id, organization_id, project_id, country_code, language_code, search_engine_code, device, assigned_provider, coverage_status, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );

    const seenTargetKeys = new Set<string>();
    for (const t of input.marketTargets) {
      const key = `${t.countryCode.toUpperCase()}:${t.languageCode.toLowerCase()}:${t.searchEngineCode}`;
      if (seenTargetKeys.has(key)) continue;
      seenTargetKeys.add(key);

      const resolution = resolveMarketProvider(t.countryCode, t.languageCode, t.searchEngineCode);
      insertTarget.run(
        crypto.randomUUID(),
        input.organizationId,
        projectId,
        resolution.countryCode,
        resolution.languageCode,
        resolution.searchEngineCode,
        t.device,
        resolution.assignedProvider,
        resolution.coverageStatus,
        now
      );
    }

    const insertComp = db.prepare(
      `INSERT INTO project_competitors (id, organization_id, project_id, domain, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const seenDomains = new Set<string>();
    for (const c of input.competitors) {
      const dom = c.domain.toLowerCase();
      if (seenDomains.has(dom)) continue;
      seenDomains.add(dom);
      insertComp.run(crypto.randomUUID(), input.organizationId, projectId, dom, c.label ?? '', now);
    }

    writeAuditLog(db, {
      organizationId: input.organizationId,
      actorUserId: input.createdByUserId,
      action: 'project.created',
      entityType: 'project',
      entityId: projectId,
      metadata: { name: input.name, targetsCount: seenTargetKeys.size },
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return getProjectById(db, input.organizationId, projectId)!;
}

export function listProjectsForOrg(db: DatabaseSync, organizationId: string): Project[] {
  const rows = db
    .prepare(
      `SELECT id, organization_id, name, website_url, business_description, industry, target_audience, primary_country_code, business_goals, created_at, updated_at
       FROM projects WHERE organization_id = ? ORDER BY created_at DESC`
    )
    .all(organizationId) as Array<{
    id: string;
    organization_id: string;
    name: string;
    website_url: string;
    business_description: string;
    industry: string;
    target_audience: string;
    primary_country_code: string;
    business_goals: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => hydrateProject(db, organizationId, r));
}

export function getProjectById(
  db: DatabaseSync,
  organizationId: string,
  projectId: string
): Project | null {
  const row = db
    .prepare(
      `SELECT id, organization_id, name, website_url, business_description, industry, target_audience, primary_country_code, business_goals, created_at, updated_at
       FROM projects WHERE id = ? AND organization_id = ?`
    )
    .get(projectId, organizationId) as
    | {
        id: string;
        organization_id: string;
        name: string;
        website_url: string;
        business_description: string;
        industry: string;
        target_audience: string;
        primary_country_code: string;
        business_goals: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!row) return null;
  return hydrateProject(db, organizationId, row);
}

function hydrateProject(
  db: DatabaseSync,
  organizationId: string,
  row: {
    id: string;
    organization_id: string;
    name: string;
    website_url: string;
    business_description: string;
    industry: string;
    target_audience: string;
    primary_country_code: string;
    business_goals: string;
    created_at: string;
    updated_at: string;
  }
): Project {
  const targetRows = db
    .prepare(
      `SELECT id, project_id, country_code, language_code, search_engine_code, device, assigned_provider, coverage_status, is_active, created_at
       FROM project_market_targets WHERE project_id = ? AND organization_id = ? ORDER BY created_at ASC`
    )
    .all(row.id, organizationId) as Array<{
    id: string;
    project_id: string;
    country_code: string;
    language_code: string;
    search_engine_code: 'google' | 'yandex' | 'bing';
    device: 'desktop' | 'mobile' | 'both';
    assigned_provider: string;
    coverage_status: ProjectMarketTarget['coverageStatus'];
    is_active: number;
    created_at: string;
  }>;

  const compRows = db
    .prepare(
      `SELECT id, project_id, domain, label, created_at
       FROM project_competitors WHERE project_id = ? AND organization_id = ? ORDER BY created_at ASC`
    )
    .all(row.id, organizationId) as Array<{
    id: string;
    project_id: string;
    domain: string;
    label: string;
    created_at: string;
  }>;

  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    websiteUrl: row.website_url,
    businessDescription: row.business_description,
    industry: row.industry,
    targetAudience: row.target_audience,
    primaryCountryCode: row.primary_country_code,
    businessGoals: row.business_goals,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    marketTargets: targetRows.map((t) => ({
      id: t.id,
      projectId: t.project_id,
      countryCode: t.country_code,
      languageCode: t.language_code,
      searchEngineCode: t.search_engine_code,
      device: t.device,
      assignedProvider: t.assigned_provider,
      coverageStatus: t.coverage_status,
      isActive: Boolean(t.is_active),
      createdAt: t.created_at,
    })),
    competitors: compRows.map(
      (c): ProjectCompetitor => ({
        id: c.id,
        projectId: c.project_id,
        domain: c.domain,
        label: c.label,
        createdAt: c.created_at,
      })
    ),
  };
}

export function deleteProjectForOrg(
  db: DatabaseSync,
  organizationId: string,
  projectId: string,
  actorUserId: string
): boolean {
  const result = db
    .prepare('DELETE FROM projects WHERE id = ? AND organization_id = ?')
    .run(projectId, organizationId);
  if (result.changes > 0) {
    writeAuditLog(db, {
      organizationId,
      actorUserId,
      action: 'project.deleted',
      entityType: 'project',
      entityId: projectId,
    });
    return true;
  }
  return false;
}

export function addMarketTargetToProject(
  db: DatabaseSync,
  organizationId: string,
  projectId: string,
  actorUserId: string,
  target: {
    countryCode: string;
    languageCode: string;
    searchEngineCode: 'google' | 'yandex' | 'bing';
    device: 'desktop' | 'mobile' | 'both';
  }
): Project | null {
  const existing = getProjectById(db, organizationId, projectId);
  if (!existing) return null;

  const resolution = resolveMarketProvider(
    target.countryCode,
    target.languageCode,
    target.searchEngineCode
  );
  const now = new Date().toISOString();

  db.prepare(
    `INSERT OR IGNORE INTO project_market_targets
     (id, organization_id, project_id, country_code, language_code, search_engine_code, device, assigned_provider, coverage_status, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  ).run(
    crypto.randomUUID(),
    organizationId,
    projectId,
    resolution.countryCode,
    resolution.languageCode,
    resolution.searchEngineCode,
    target.device,
    resolution.assignedProvider,
    resolution.coverageStatus,
    now
  );

  writeAuditLog(db, {
    organizationId,
    actorUserId,
    action: 'project.market_target_added',
    entityType: 'project',
    entityId: projectId,
    metadata: {
      countryCode: resolution.countryCode,
      languageCode: resolution.languageCode,
      searchEngineCode: resolution.searchEngineCode,
    },
  });

  return getProjectById(db, organizationId, projectId);
}

export function addCompetitorToProject(
  db: DatabaseSync,
  organizationId: string,
  projectId: string,
  actorUserId: string,
  competitor: { domain: string; label?: string }
): Project | null {
  const existing = getProjectById(db, organizationId, projectId);
  if (!existing) return null;

  db.prepare(
    `INSERT OR IGNORE INTO project_competitors (id, organization_id, project_id, domain, label, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    crypto.randomUUID(),
    organizationId,
    projectId,
    competitor.domain.toLowerCase(),
    competitor.label ?? '',
    new Date().toISOString()
  );

  writeAuditLog(db, {
    organizationId,
    actorUserId,
    action: 'project.competitor_added',
    entityType: 'project',
    entityId: projectId,
    metadata: { domain: competitor.domain.toLowerCase() },
  });

  return getProjectById(db, organizationId, projectId);
}

export function listMarketRegistry(db: DatabaseSync): {
  countries: CountryOption[];
  languages: LanguageOption[];
  searchEngines: SearchEngineOption[];
  coverage: ProviderCoverageEntry[];
} {
  const countries = (
    db
      .prepare('SELECT code, name_en, name_ar, region, default_language_code FROM countries ORDER BY name_en')
      .all() as Array<{
      code: string;
      name_en: string;
      name_ar: string;
      region: string;
      default_language_code: string;
    }>
  ).map((c) => ({
    code: c.code,
    nameEn: c.name_en,
    nameAr: c.name_ar,
    region: c.region,
    defaultLanguageCode: c.default_language_code,
  }));

  const languages = (
    db
      .prepare('SELECT code, name_en, name_native, direction FROM languages ORDER BY name_en')
      .all() as Array<{
      code: string;
      name_en: string;
      name_native: string;
      direction: 'ltr' | 'rtl';
    }>
  ).map((l) => ({
    code: l.code,
    nameEn: l.name_en,
    nameNative: l.name_native,
    direction: l.direction,
  }));

  const searchEngines = (
    db
      .prepare('SELECT code, name FROM search_engines ORDER BY name')
      .all() as Array<{ code: 'google' | 'yandex' | 'bing'; name: string }>
  ).map((se) => ({
    code: se.code,
    name: se.name,
  }));

  const coverage = (
    db
      .prepare(
        `SELECT provider_code, country_code, search_engine_code, supports_serp, supports_keyword_volume, supports_first_party, coverage_status, notes
         FROM provider_coverage ORDER BY country_code, search_engine_code`
      )
      .all() as Array<{
      provider_code: string;
      country_code: string;
      search_engine_code: string;
      supports_serp: number;
      supports_keyword_volume: number;
      supports_first_party: number;
      coverage_status: ProviderCoverageEntry['coverageStatus'];
      notes: string;
    }>
  ).map((cov) => ({
    providerCode: cov.provider_code,
    countryCode: cov.country_code,
    searchEngineCode: cov.search_engine_code,
    supportsSerp: Boolean(cov.supports_serp),
    supportsKeywordVolume: Boolean(cov.supports_keyword_volume),
    supportsFirstParty: Boolean(cov.supports_first_party),
    coverageStatus: cov.coverage_status,
    notes: cov.notes,
  }));

  return { countries, languages, searchEngines, coverage };
}

export function listOrgMembersAndInvites(
  db: DatabaseSync,
  organizationId: string
): { members: OrganizationMemberItem[]; invitations: OrganizationInvitationItem[] } {
  const members = (
    db
      .prepare(
        `SELECT m.id, m.user_id, u.email, u.full_name, m.role, m.created_at
         FROM organization_members m
         INNER JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = ?
         ORDER BY m.created_at ASC`
      )
      .all(organizationId) as Array<{
      id: string;
      user_id: string;
      email: string;
      full_name: string;
      role: OrgRole;
      created_at: string;
    }>
  ).map((m) => ({
    id: m.id,
    userId: m.user_id,
    email: m.email,
    fullName: m.full_name,
    role: m.role,
    createdAt: m.created_at,
  }));

  const invitations = (
    db
      .prepare(
        `SELECT id, email, role, status, expires_at, created_at
         FROM organization_invitations
         WHERE organization_id = ?
         ORDER BY created_at DESC`
      )
      .all(organizationId) as Array<{
      id: string;
      email: string;
      role: 'admin' | 'analyst' | 'viewer';
      status: string;
      expires_at: string;
      created_at: string;
    }>
  ).map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: inv.status,
    expiresAt: inv.expires_at,
    createdAt: inv.created_at,
  }));

  return { members, invitations };
}

export function createOrgInvitation(
  db: DatabaseSync,
  input: {
    organizationId: string;
    email: string;
    role: 'admin' | 'analyst' | 'viewer';
    invitedByUserId: string;
  }
): OrganizationInvitationItem {
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

  db.prepare(
    `INSERT INTO organization_invitations (id, organization_id, email, role, status, invited_by, expires_at, created_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).run(
    id,
    input.organizationId,
    input.email.toLowerCase(),
    input.role,
    input.invitedByUserId,
    expires.toISOString(),
    now.toISOString()
  );

  writeAuditLog(db, {
    organizationId: input.organizationId,
    actorUserId: input.invitedByUserId,
    action: 'member.invited',
    entityType: 'invitation',
    entityId: id,
    metadata: { email: input.email.toLowerCase(), role: input.role },
  });

  return {
    id,
    email: input.email.toLowerCase(),
    role: input.role,
    status: 'pending',
    expiresAt: expires.toISOString(),
    createdAt: now.toISOString(),
  };
}

export function listAuditLogsForOrg(
  db: DatabaseSync,
  organizationId: string,
  limit = 40
): AuditLogItem[] {
  const rows = db
    .prepare(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata_json, u.email as actor_email, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.organization_id = ?
       ORDER BY a.created_at DESC
       LIMIT ?`
    )
    .all(organizationId, limit) as Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    metadata_json: string;
    actor_email: string | null;
    created_at: string;
  }>;

  return rows.map((r) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(r.metadata_json) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return {
      id: r.id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: parsed,
      actorEmail: r.actor_email,
      createdAt: r.created_at,
    };
  });
}

export function insertContactLead(
  db: DatabaseSync,
  input: {
    fullName: string;
    email: string;
    company: string;
    countryCode: string;
    message: string;
  }
): { id: string; createdAt: string } {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO contact_leads (id, full_name, email, company, country_code, message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.fullName, input.email.toLowerCase(), input.company, input.countryCode, input.message, createdAt);
  return { id, createdAt };
}
