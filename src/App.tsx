import { useEffect, useState } from 'react';
import { AppShell } from './components/AppShell';
import { AuthViews } from './components/AuthViews';
import { OnboardingWizard } from './components/OnboardingWizard';
import { PublicFooter } from './components/PublicFooter';
import { PublicHeader, type PublicRoute } from './components/PublicHeader';
import { PublicSite } from './components/PublicSite';
import { api } from './lib/api';
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

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [publicRoute, setPublicRoute] = useState<PublicRoute>('home');
  const [viewMode, setViewMode] = useState<'public' | 'onboarding' | 'app'>('public');

  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

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

  useEffect(() => {
    let active = true;
    async function init() {
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
        // Registry fetch errors handled gracefully
      }

      try {
        const session = await api.me();
        if (!active || !session.user) return;
        setUser(session.user);
        setLocale(session.user.preferredLocale);
        setOrganizations(session.organizations);
        if (session.organizations.length > 0) {
          setActiveOrgId(session.organizations[0].id);
          setViewMode('app');
        } else {
          setViewMode('onboarding');
        }
      } catch {
        // Not signed in — stay on public site
      } finally {
        if (active) setBooting(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);

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

  const handleAuthSuccess = (authedUser: User, orgs: OrganizationSummary[]) => {
    setUser(authedUser);
    setLocale(authedUser.preferredLocale);
    setOrganizations(orgs);
    if (orgs.length > 0) {
      setActiveOrgId(orgs[0].id);
      setViewMode('app');
    } else {
      setViewMode('onboarding');
    }
  };

  const handleLogout = async () => {
    await api.logout();
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
          setOrganizations([...organizations, newOrg]);
          setActiveOrgId(newOrg.id);
        }}
        onToggleLocale={handleToggleLocale}
        onLogout={handleLogout}
        onBackToSite={() => {
          setViewMode('public');
          setPublicRoute('home');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FDFDFF] text-[#111111]">
      <PublicHeader
        route={publicRoute}
        locale={locale}
        isAuthenticated={Boolean(user)}
        onNavigate={(next) => {
          setPublicRoute(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onOpenApp={() => {
          if (organizations.length > 0) setViewMode('app');
          else setViewMode('onboarding');
        }}
      />

      <div className="flex-1">
        {publicRoute === 'login' || publicRoute === 'signup' ? (
          <AuthViews
            mode={publicRoute}
            locale={locale}
            onSuccess={handleAuthSuccess}
            onNavigate={(next) => setPublicRoute(next)}
          />
        ) : (
          <PublicSite
            route={publicRoute}
            locale={locale}
            plans={plans}
            onToggleLocale={handleToggleLocale}
            onNavigate={(next) => {
              setPublicRoute(next);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </div>

      <PublicFooter
        locale={locale}
        onToggleLocale={handleToggleLocale}
        onNavigate={(next) => {
          setPublicRoute(next);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
