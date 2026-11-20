import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CreditCard,
  FileText,
  FolderKanban,
  Globe,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  PenTool,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { DICT } from '../lib/i18n';
import type {
  AuditLogItem,
  CountryOption,
  LanguageOption,
  Locale,
  OrganizationInvitationItem,
  OrganizationMemberItem,
  OrganizationSummary,
  PlanDefinition,
  Project,
  ProviderCoverageEntry,
  SearchEngineOption,
  UsageSummary,
  User,
} from '../lib/types';
import { BrandMark } from './BrandMark';
import { DashboardOverview } from './DashboardOverview';
import { ModulePreviews } from './ModulePreviews';
import { OrgAndBillingViews } from './OrgAndBillingViews';
import { ProjectsManager } from './ProjectsManager';

interface AppShellProps {
  user: User;
  organizations: OrganizationSummary[];
  activeOrgId: string;
  locale: Locale;
  countries: CountryOption[];
  languages: LanguageOption[];
  searchEngines: SearchEngineOption[];
  coverage: ProviderCoverageEntry[];
  plans: PlanDefinition[];
  onSwitchOrg: (orgId: string) => void;
  onOrgCreated: (org: OrganizationSummary) => void;
  onToggleLocale: (next: Locale) => void;
  onLogout: () => void;
  onBackToSite: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  user,
  organizations,
  activeOrgId,
  locale,
  countries,
  languages,
  searchEngines,
  coverage,
  plans,
  onSwitchOrg,
  onOrgCreated,
  onToggleLocale,
  onLogout,
  onBackToSite,
}) => {
  const t = DICT[locale].app;
  const [section, setSection] = useState<string>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [forceCreateProject, setForceCreateProject] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgData, setOrgData] = useState<{
    organization: OrganizationSummary;
    plan: PlanDefinition | null;
    usage: UsageSummary;
    projects: Project[];
    members: OrganizationMemberItem[];
    invitations: OrganizationInvitationItem[];
    auditLogs: AuditLogItem[];
  } | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getOrgOverview(activeOrgId);
      setOrgData(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const navGroups: Array<{
    label: string;
    items: Array<{ id: string; label: string; icon: React.ReactNode }>;
  }> = [
    {
      label: locale === 'ar' ? 'القيادة' : 'Workspace',
      items: [
        { id: 'overview', label: t.overview, icon: <LayoutDashboard className="w-4 h-4" /> },
        { id: 'projects', label: t.projects, icon: <FolderKanban className="w-4 h-4" /> },
        { id: 'markets', label: t.markets, icon: <Globe className="w-4 h-4" /> },
      ],
    },
    {
      label: locale === 'ar' ? 'السيو والذكاء' : 'Search & AI',
      items: [
        { id: 'keywords', label: t.keywords, icon: <Search className="w-4 h-4" /> },
        { id: 'ranks', label: t.ranks, icon: <TrendingUp className="w-4 h-4" /> },
        { id: 'competitors', label: t.competitors, icon: <Activity className="w-4 h-4" /> },
        { id: 'audit', label: t.audit, icon: <ShieldCheck className="w-4 h-4" /> },
        { id: 'geo', label: t.geo, icon: <Sparkles className="w-4 h-4" /> },
        { id: 'aeo', label: t.aeo, icon: <Sparkles className="w-4 h-4" /> },
        { id: 'content', label: t.content, icon: <PenTool className="w-4 h-4" /> },
        { id: 'agents', label: t.agents, icon: <Bot className="w-4 h-4" /> },
        { id: 'reports', label: t.reports, icon: <FileText className="w-4 h-4" /> },
      ],
    },
    {
      label: locale === 'ar' ? 'المؤسسة' : 'Organization',
      items: [
        { id: 'integrations', label: t.integrations, icon: <Link2 className="w-4 h-4" /> },
        { id: 'team', label: t.team, icon: <Users className="w-4 h-4" /> },
        { id: 'billing', label: t.billing, icon: <CreditCard className="w-4 h-4" /> },
        { id: 'settings', label: t.settings, icon: <Settings className="w-4 h-4" /> },
      ],
    },
  ];

  const handleSelectSection = (nextSection: string) => {
    setSection(nextSection);
    setForceCreateProject(false);
    if (nextSection !== 'projects') setSelectedProjectId(null);
    setMobileMenuOpen(false);
  };

  const sidebarContent = (
    <div className="h-full flex flex-col justify-between bg-[#F42902] text-[#FDFDFF] p-4">
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2 pt-1">
          <button
            type="button"
            onClick={onBackToSite}
            className="text-start cursor-pointer"
          >
            <BrandMark inverted showArabicInline />
          </button>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded bg-[#111111]/30 text-[#FDFDFF]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Organization Switcher */}
        <div className="px-1">
          <label htmlFor="org-switcher" className="block text-[11px] font-bold uppercase text-[#FDFDFF]/80 mb-1">
            {locale === 'ar' ? 'المؤسسة النشطة' : 'Organization'}
          </label>
          <select
            id="org-switcher"
            value={activeOrgId}
            onChange={(e) => {
              setSelectedProjectId(null);
              onSwitchOrg(e.target.value);
            }}
            className="w-full px-3 py-2 rounded-lg bg-[#111111] text-[#FDFDFF] text-xs font-bold border border-[#FDFDFF]/20"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role})
              </option>
            ))}
          </select>
        </div>

        {/* Navigation Links */}
        <nav aria-label="Dashboard" className="space-y-5">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <div className="px-2 text-[11px] font-bold uppercase tracking-wider text-[#FDFDFF]/75">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSection(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#83FD80] text-[#111111]'
                          : 'text-[#FDFDFF]/90 hover:bg-[#111111]/20'
                      }`}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="pt-4 border-t border-[#FDFDFF]/20 space-y-3">
        <div className="px-2 text-xs">
          <div className="font-bold truncate">{user.fullName}</div>
          <div className="text-[11px] opacity-80 truncate font-mono">{user.email}</div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[#111111] text-[#FDFDFF] text-xs font-bold hover:bg-[#111111]/80 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{t.logout}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFDFF] text-[#111111] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[260px] shrink-0 border-e-2 border-[#111111] sticky top-0 h-screen overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-[270px] h-full overflow-y-auto border-e-2 border-[#111111]">
            {sidebarContent}
          </div>
          <button
            type="button"
            aria-label="Close backdrop"
            onClick={() => setMobileMenuOpen(false)}
            className="flex-1 bg-[#111111]/50"
          />
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-6 border-b border-[#111111]/15 bg-[#FDFDFF] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-[#111111]/20"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="text-sm font-bold truncate">
              <span className="text-[#52525B]">{orgData?.organization.name ?? '...'}</span>
              <span className="mx-2 text-[#52525B]">/</span>
              <span className="capitalize">{section}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="inline-flex rounded-md border border-[#111111]/20 p-0.5">
              <button
                type="button"
                onClick={() => onToggleLocale('en')}
                className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer ${
                  locale === 'en' ? 'bg-[#111111] text-[#FDFDFF]' : 'text-[#52525B]'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => onToggleLocale('ar')}
                className={`px-2.5 py-1 text-xs font-bold rounded cursor-pointer ${
                  locale === 'ar' ? 'bg-[#111111] text-[#FDFDFF]' : 'text-[#52525B]'
                }`}
              >
                عربي
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setSection('projects');
                setForceCreateProject(true);
              }}
              className="px-4 py-2 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.newProject}
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1320px] w-full mx-auto">
          {loading && !orgData ? (
            <div className="py-20 text-center text-sm font-semibold text-[#52525B]">
              Loading EL MATBA5 workspace...
            </div>
          ) : error ? (
            <div role="alert" className="p-4 rounded-xl border border-[#F42902] bg-[#F42902]/10 text-sm">
              {error}
            </div>
          ) : orgData ? (
            <>
              {section === 'overview' && (
                <DashboardOverview
                  locale={locale}
                  organization={orgData.organization}
                  plan={orgData.plan}
                  usage={orgData.usage}
                  projects={orgData.projects}
                  demoMode={demoMode}
                  onToggleDemoMode={setDemoMode}
                  onCreateProject={() => {
                    setSection('projects');
                    setForceCreateProject(true);
                  }}
                  onOpenProject={(projId) => {
                    setSelectedProjectId(projId);
                    setSection('projects');
                  }}
                  onGoToSection={(sec) => handleSelectSection(sec)}
                />
              )}

              {section === 'projects' && (
                <ProjectsManager
                  orgId={orgData.organization.id}
                  locale={locale}
                  projects={orgData.projects}
                  selectedProjectId={selectedProjectId}
                  countries={countries}
                  languages={languages}
                  searchEngines={searchEngines}
                  onSelectProject={setSelectedProjectId}
                  onRefresh={loadOverview}
                  forceCreateOpen={forceCreateProject}
                  onCloseCreate={() => setForceCreateProject(false)}
                />
              )}

              {(section === 'markets' ||
                section === 'team' ||
                section === 'billing' ||
                section === 'settings') && (
                <OrgAndBillingViews
                  section={section}
                  organization={orgData.organization}
                  plan={orgData.plan}
                  allPlans={plans}
                  usage={orgData.usage}
                  members={orgData.members}
                  invitations={orgData.invitations}
                  auditLogs={orgData.auditLogs}
                  coverage={coverage}
                  onRefresh={loadOverview}
                  onCreatedOrg={onOrgCreated}
                />
              )}

              {![
                'overview',
                'projects',
                'markets',
                'team',
                'billing',
                'settings',
              ].includes(section) && (
                <ModulePreviews
                  section={section}
                  projects={orgData.projects}
                  demoMode={demoMode}
                  onToggleDemoMode={setDemoMode}
                />
              )}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
};
