import React, { useState } from 'react';
import { AlertCircle, ArrowUpRight, Globe, Plus } from 'lucide-react';
import { DEMO_DATASET } from '../data/demoData';
import { DICT } from '../lib/i18n';
import type {
  Locale,
  OrganizationSummary,
  PlanDefinition,
  Project,
  UsageSummary,
} from '../lib/types';

interface DashboardOverviewProps {
  locale: Locale;
  organization: OrganizationSummary;
  plan: PlanDefinition | null;
  usage: UsageSummary;
  projects: Project[];
  demoMode: boolean;
  onToggleDemoMode: (val: boolean) => void;
  onCreateProject: () => void;
  onOpenProject: (projectId: string) => void;
  onGoToSection: (section: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  locale,
  organization,
  plan,
  usage,
  projects,
  demoMode,
  onToggleDemoMode,
  onCreateProject,
  onOpenProject,
  onGoToSection,
}) => {
  const t = DICT[locale].app;
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterEngine, setFilterEngine] = useState<string>('all');
  const [filterDevice, setFilterDevice] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('30d');

  const filteredProjects = projects.filter((p) =>
    selectedProjectId === 'all' ? true : p.id === selectedProjectId
  );

  const allTargets = filteredProjects.flatMap((p) =>
    p.marketTargets.map((m) => ({ ...m, projectName: p.name }))
  );

  const visibleTargets = allTargets.filter((m) => {
    if (filterCountry !== 'all' && m.countryCode !== filterCountry) return false;
    if (filterEngine !== 'all' && m.searchEngineCode !== filterEngine) return false;
    if (filterDevice !== 'all' && m.device !== filterDevice && m.device !== 'both') return false;
    return true;
  });

  const uniqueCountries = Array.from(new Set(projects.flatMap((p) => p.marketTargets.map((m) => m.countryCode))));

  return (
    <div className="space-y-6">
      {/* Mode Banner */}
      <div
        className={`rounded-xl border-2 border-[#111111] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          demoMode ? 'bg-[#83FD80]/25' : 'bg-[#FDFDFF]'
        }`}
      >
        <div className="space-y-1">
          <div className="text-xs font-extrabold uppercase tracking-wider text-[#F42902]">
            {demoMode
              ? t.demoBannerTitle
              : locale === 'ar'
              ? 'الوضع الفعلي للمؤسسة (بيانات حقيقية محفوظة)'
              : 'LIVE MULTI-TENANT WORKSPACE'}
          </div>
          <p className="text-xs text-[#52525B]">
            {demoMode
              ? t.demoBannerBody
              : locale === 'ar'
              ? 'تعرض هذه الشاشة مشاريعك الحقيقية فقط. لا يتم اختلاق أرقام ترتيب أو زيارات قبل ربط مزودي البحث في المرحلة الثانية.'
              : 'Showing strictly persisted organization records. Search rankings and crawl metrics remain empty until live providers are connected in Phase 2+.'}
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[#111111] p-0.5 bg-[#FDFDFF] shrink-0 self-start">
          <button
            type="button"
            onClick={() => onToggleDemoMode(false)}
            className={`px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer ${
              !demoMode ? 'bg-[#111111] text-[#FDFDFF]' : 'text-[#52525B]'
            }`}
          >
            {t.liveMode}
          </button>
          <button
            type="button"
            onClick={() => onToggleDemoMode(true)}
            className={`px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer ${
              demoMode ? 'bg-[#83FD80] text-[#111111]' : 'text-[#52525B]'
            }`}
          >
            {t.demoMode}
          </button>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label htmlFor="f-proj" className="block text-xs font-semibold text-[#52525B] mb-1">
            Project
          </label>
          <select
            id="f-proj"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#111111]/20 text-xs font-medium bg-[#FDFDFF]"
          >
            <option value="all">All Projects ({projects.length})</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-country" className="block text-xs font-semibold text-[#52525B] mb-1">
            Country
          </label>
          <select
            id="f-country"
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#111111]/20 text-xs font-medium bg-[#FDFDFF]"
          >
            <option value="all">All Countries</option>
            {uniqueCountries.map((cc) => (
              <option key={cc} value={cc}>
                {cc}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="f-engine" className="block text-xs font-semibold text-[#52525B] mb-1">
            Search Engine
          </label>
          <select
            id="f-engine"
            value={filterEngine}
            onChange={(e) => setFilterEngine(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#111111]/20 text-xs font-medium bg-[#FDFDFF]"
          >
            <option value="all">All Engines</option>
            <option value="google">Google</option>
            <option value="yandex">Yandex</option>
            <option value="bing">Bing</option>
          </select>
        </div>

        <div>
          <label htmlFor="f-device" className="block text-xs font-semibold text-[#52525B] mb-1">
            Device
          </label>
          <select
            id="f-device"
            value={filterDevice}
            onChange={(e) => setFilterDevice(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#111111]/20 text-xs font-medium bg-[#FDFDFF]"
          >
            <option value="all">Desktop & Mobile</option>
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </select>
        </div>

        <div>
          <label htmlFor="f-range" className="block text-xs font-semibold text-[#52525B] mb-1">
            Date Range
          </label>
          <select
            id="f-range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-[#111111]/20 text-xs font-medium bg-[#FDFDFF]"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* KPI Strip */}
      {demoMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEMO_DATASET.overviewMetrics.map((m) => (
            <div
              key={m.id}
              className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-5 space-y-2"
            >
              <div className="text-xs font-semibold text-[#52525B]">
                {locale === 'ar' ? m.labelAr : m.labelEn}
              </div>
              <div className="font-display text-2xl font-extrabold tabular-nums">{m.value}</div>
              <div className="text-xs font-mono text-[#F42902]">{m.delta}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-5 space-y-1.5">
            <div className="text-xs font-semibold text-[#52525B]">Active Projects</div>
            <div className="font-display text-2xl font-extrabold tabular-nums">
              {usage.projectsCount} / {plan?.maxProjects ?? '—'}
            </div>
            <div className="text-xs text-[#52525B]">{organization.name}</div>
          </div>

          <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-5 space-y-1.5">
            <div className="text-xs font-semibold text-[#52525B]">Configured Market Targets</div>
            <div className="font-display text-2xl font-extrabold tabular-nums">
              {visibleTargets.length}
            </div>
            <div className="text-xs text-[#52525B]">Across {uniqueCountries.length} country/ies</div>
          </div>

          <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-5 space-y-1.5">
            <div className="text-xs font-semibold text-[#52525B]">Tracked Keywords (Live)</div>
            <div className="font-display text-2xl font-extrabold tabular-nums">
              {usage.keywordsTracked} / {plan?.maxKeywords ?? '—'}
            </div>
            <div className="text-xs text-[#F42902]">Connect Phase 2 provider to track</div>
          </div>

          <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-5 space-y-1.5">
            <div className="text-xs font-semibold text-[#52525B]">Subscription Status</div>
            <div className="font-display text-2xl font-extrabold uppercase">
              {organization.planId}
            </div>
            <div className="text-xs font-mono text-[#52525B]">
              {organization.subscriptionStatus} · Billing {organization.billingCountryCode}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Projects & Market Matrix */}
        <div className="lg:col-span-7 bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-xl font-extrabold">
              {locale === 'ar' ? 'المشاريع والأسواق المستهدفة' : 'Projects & Market Targets'}
            </h2>
            <button
              type="button"
              onClick={onCreateProject}
              className="px-3.5 py-2 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.newProject}</span>
            </button>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="py-10 text-center space-y-3 border border-dashed border-[#111111]/20 rounded-lg">
              <Globe className="w-7 h-7 mx-auto text-[#F42902]" />
              <div className="font-bold">{t.noProjectsTitle}</div>
              <p className="text-xs text-[#52525B] max-w-sm mx-auto">{t.noProjectsBody}</p>
            </div>
          ) : (
            <div className="divide-y divide-[#111111]/10">
              {filteredProjects.map((proj) => (
                <div key={proj.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj.id)}
                      className="font-bold text-base hover:text-[#F42902] flex items-center gap-1 cursor-pointer text-start"
                    >
                      <span>{proj.name}</span>
                      <ArrowUpRight className="w-4 h-4" />
                    </button>
                    <div className="text-xs font-mono text-[#52525B]">{proj.websiteUrl}</div>
                    <div className="text-xs text-[#52525B]">
                      {proj.marketTargets
                        .map((m) => `${m.countryCode}/${m.languageCode.toUpperCase()}/${m.searchEngineCode}`)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="text-end shrink-0 text-xs tabular-nums">
                    <div className="font-bold">{proj.marketTargets.length} markets</div>
                    <div className="text-[#52525B]">{proj.competitors.length} competitors</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recommended Next Actions & Demo/Live Clarity */}
        <div className="lg:col-span-5 bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-xl font-extrabold">
            {locale === 'ar' ? 'الخطوات الموصى بها' : 'Recommended Next Actions'}
          </h2>
          <div className="divide-y divide-[#111111]/10 text-sm">
            <div className="py-3.5 first:pt-0 flex items-start justify-between gap-3">
              <div>
                <div className="font-bold">Verify Market Provider Coverage</div>
                <p className="text-xs text-[#52525B] mt-0.5">
                  Confirm Google/DataForSEO vs. Yandex Russia routes for every active market target.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onGoToSection('markets')}
                className="text-xs font-bold text-[#F42902] shrink-0 cursor-pointer hover:underline"
              >
                Inspect
              </button>
            </div>

            <div className="py-3.5 flex items-start justify-between gap-3">
              <div>
                <div className="font-bold">Connect Search Console & Crawlers</div>
                <p className="text-xs text-[#52525B] mt-0.5">
                  Review Phase 2–5 provider integrations required for live clicks, SERPs, and crawls.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onGoToSection('integrations')}
                className="text-xs font-bold text-[#F42902] shrink-0 cursor-pointer hover:underline"
              >
                Review
              </button>
            </div>

            <div className="py-3.5 last:pb-0 flex items-start justify-between gap-3">
              <div>
                <div className="font-bold">Invite Agency Team Members</div>
                <p className="text-xs text-[#52525B] mt-0.5">
                  Add analysts or clients with organization-scoped roles and audit tracking.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onGoToSection('team')}
                className="text-xs font-bold text-[#F42902] shrink-0 cursor-pointer hover:underline"
              >
                Manage
              </button>
            </div>
          </div>

          {demoMode && (
            <div className="pt-4 border-t border-[#111111]/10 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#F42902]">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Sample Organic Visibility Trajectory (Demo)</span>
              </div>
              <div className="grid grid-cols-5 gap-2 items-end h-24 pt-2">
                {DEMO_DATASET.visibilitySeries.map((pt) => (
                  <div key={pt.week} className="flex flex-col items-center gap-1 h-full justify-end">
                    <div
                      className="w-full bg-[#F42902] rounded-t"
                      style={{ height: `${Math.min(100, pt.googleEg * 2.2)}%` }}
                      title={`Sample EG: ${pt.googleEg}%`}
                    />
                    <span className="text-[11px] font-mono text-[#52525B]">{pt.week}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
