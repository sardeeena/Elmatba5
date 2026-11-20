import { useCallback, useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthViews } from './components/AuthViews';
import { OnboardingWizard } from './components/OnboardingWizard';
import { PublicFooter } from './components/PublicFooter';
import { PublicHeader, type PublicRoute } from './components/PublicHeader';
import { PublicSite } from './components/PublicSite';
import { api } from './lib/api';
import {
  fetchPublicConfig,
  getSupabaseClient,
  signOutSupabase,
  subscribeAuthChanges,
} from './lib/supabase';
import type {
  CountryOption,
  LanguageOption,
  Locale,
  OrganizationSummary,
  PlanDefinition,
  ProviderCoverageEntry,
  SearchEngineOption,
  User,
} from './lib/types';

const PENDING_INVITE_STORAGE_KEY = 'elmatba5_pending_invite';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [publicRoute, setPublicRoute] = useState<PublicRoute>('home');
  const [authFormMode, setAuthFormMode] = useState<'login' | 'signup' | 'forgot' | 'recovery'>(
    'login'
  );
  const [viewMode, setViewMode] = useState<'public' | 'onboarding' | 'app'>('public');

  const [booting, setBooting] = useState(true);
  const [supabaseConfigured, setSupabaseConfigured] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [inviteBannerMsg, setInviteBannerMsg] = useState<string | null>(null);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [languages, setLanguages] = useState<LanguageOption[]>([]);
  const [searchEngines, setSearchEngines] = useState<SearchEngineOption[]>([]);
  const [coverage, setCoverage] = useState<ProviderCoverageEntry[]>([]);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);

  // Synchronize HTML dir & lang attributes for Arabic RTL / English LTR
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const syncAuthenticatedWorkspace = useCallback(async () => {
    const profile = await api.getProfile();
    setUser(profile.user);
    setLocale(profile.user.preferredLocale);

    let orgs = profile.organizations;
    const storedInvite = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
    if (storedInvite) {
      try {
        const accepted = await api.acceptInvitation(storedInvite);
        sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
        setPendingInviteToken(null);
        setInviteBannerMsg(`Joined ${accepted.organization.name} as ${accepted.organization.role}.`);
        const refreshed = await api.getProfile();
        orgs = refreshed.organizations;
      } catch (err) {
        sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
        setPendingInviteToken(null);
        setInviteBannerMsg((err as Error).message);
      }
    }

    setOrganizations(orgs);
    if (orgs.length > 0) {
      setActiveOrgId((prev) => (prev && orgs.some((o) => o.id === prev) ? prev : orgs[0].id));
      setViewMode('app');
    } else {
      setViewMode('onboarding');
    }
  }, []);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    async function init() {
      // Capture ?invite=<token> or ?mode=recovery from URL
      const params = new URLSearchParams(window.location.search);
      const inviteParam = params.get('invite');
      const modeParam = params.get('mode');
      if (inviteParam) {
        sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, inviteParam);
        setPendingInviteToken(inviteParam);
      } else {
        const stored = sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
        if (stored) setPendingInviteToken(stored);
      }

      if (modeParam === 'recovery') {
        setAuthFormMode('recovery');
        setPublicRoute('login');
      }

      const [cfg, health] = await Promise.all([
        fetchPublicConfig(),
        api.getHealth().catch(() => ({
          status: 'degraded',
          database: 'unconfigured',
          schemaReady: false,
          timestamp: '',
        })),
      ]);
      if (!active) return;
      setSupabaseConfigured(cfg.configured);

      if (cfg.configured && health.schemaReady) {
        try {
          const [registry, billing] = await Promise.all([
            api.getMarketRegistry(),
            api.getPlans(),
          ]);
          if (!active) return;
          setCountries(registry.countries);
          setLanguages(registry.languages);
          setSearchEngines(registry.searchEngines);
          setCoverage(registry.coverage);
          setPlans(billing.plans);
        } catch {
          // Public site degrades gracefully when database schema isn't applied yet
        }
      }

      if (cfg.configured) {
        const client = await getSupabaseClient();
        if (client && active) {
          unsubscribe = await subscribeAuthChanges((event, session) => {
            if (!active) return;
            if (event === 'PASSWORD_RECOVERY') {
              setAuthFormMode('recovery');
              setPublicRoute('login');
              setViewMode('public');
              return;
            }
            if (event === 'SIGNED_OUT') {
              setUser(null);
              setOrganizations([]);
              setActiveOrgId(null);
              setViewMode('public');
              return;
            }
            if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
              void syncAuthenticatedWorkspace().catch(() => {
                // Handled by UI state
              });
            }
          });

          const { data } = await client.auth.getSession();
          if (data.session && active && modeParam !== 'recovery') {
            try {
              await syncAuthenticatedWorkspace();
            } catch {
              // Stay on public site if token invalid or profile unreachable
            }
          } else if (inviteParam && !data.session) {
            setAuthFormMode('login');
            setPublicRoute('login');
          }
        }
      }

      if (active) setBooting(false);
    }

    void init();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [syncAuthenticatedWorkspace]);

  const handleToggleLocale = async (next: Locale) => {
    setLocale(next);
    if (user) {
      try {
        await api.setLocale(next);
      } catch {
        // Non-blocking preference sync
      }
    }
  };

  const handleLogout = async () => {
    await signOutSupabase();
    setUser(null);
    setOrganizations([]);
    setActiveOrgId(null);
    setViewMode('public');
    setPublicRoute('home');
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#F42902] text-[#FDFDFF] flex items-center justify-center font-display text-2xl font-extrabold">
        EL MATBA5 · المطبخ
      </div>
    );
  }

  if (viewMode === 'onboarding' && user) {
    return (
      <OnboardingWizard
        locale={locale}
        countries={countries}
        languages={languages}
        searchEngines={searchEngines}
        onComplete={(org) => {
          setOrganizations([org]);
          setActiveOrgId(org.id);
          setViewMode('app');
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (viewMode === 'app' && user && activeOrgId) {
    return (
      <>
        {inviteBannerMsg && (
          <div
            role="status"
            className="bg-[#83FD80] text-[#111111] border-b-2 border-[#111111] px-6 py-2.5 text-xs font-bold flex items-center justify-between"
          >
            <span>{inviteBannerMsg}</span>
            <button
              type="button"
              onClick={() => setInviteBannerMsg(null)}
              className="underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}
        <AppShell
          user={user}
          organizations={organizations}
          activeOrgId={activeOrgId}
          locale={locale}
          countries={countries}
          languages={languages}
          searchEngines={searchEngines}
          coverage={coverage}
          plans={plans}
          onSwitchOrg={(orgId) => setActiveOrgId(orgId)}
          onOrgCreated={(newOrg) => {
            setOrganizations((prev) =>
              prev.some((o) => o.id === newOrg.id) ? prev : [...prev, newOrg]
            );
            setActiveOrgId(newOrg.id);
          }}
          onToggleLocale={handleToggleLocale}
          onLogout={handleLogout}
          onBackToSite={() => {
            setViewMode('public');
            setPublicRoute('home');
          }}
        />
      </>
    );
  }

  const navigatePublic = (next: PublicRoute) => {
    if (next === 'login') setAuthFormMode('login');
    if (next === 'signup') setAuthFormMode('signup');
    setPublicRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFDFF] text-[#111111]">
      <PublicHeader
        route={publicRoute}
        locale={locale}
        isAuthenticated={Boolean(user)}
        onNavigate={navigatePublic}
        onOpenApp={() => {
          if (organizations.length > 0) setViewMode('app');
          else setViewMode('onboarding');
        }}
      />

      <div className="flex-1">
        {publicRoute === 'login' || publicRoute === 'signup' ? (
          <AuthViews
            mode={authFormMode}
            locale={locale}
            supabaseConfigured={supabaseConfigured}
            hasPendingInvite={Boolean(pendingInviteToken)}
            onModeChange={(nextMode) => setAuthFormMode(nextMode)}
            onSessionReady={syncAuthenticatedWorkspace}
            onNavigate={navigatePublic}
          />
        ) : (
          <PublicSite
            route={publicRoute}
            locale={locale}
            plans={plans}
            onToggleLocale={handleToggleLocale}
            onNavigate={navigatePublic}
          />
        )}
      </div>

      <PublicFooter
        locale={locale}
        onToggleLocale={handleToggleLocale}
        onNavigate={navigatePublic}
      />
    </div>
  );
}
