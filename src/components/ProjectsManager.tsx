import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { resolveMarketProvider } from '../lib/marketRules';
import type {
  CountryOption,
  LanguageOption,
  Locale,
  Project,
  SearchEngineOption,
} from '../lib/types';

interface ProjectsManagerProps {
  orgId: string;
  locale: Locale;
  projects: Project[];
  selectedProjectId: string | null;
  countries: CountryOption[];
  languages: LanguageOption[];
  searchEngines: SearchEngineOption[];
  onSelectProject: (projectId: string | null) => void;
  onRefresh: () => Promise<void>;
  forceCreateOpen?: boolean;
  onCloseCreate?: () => void;
}

export const ProjectsManager: React.FC<ProjectsManagerProps> = ({
  orgId,
  locale,
  projects,
  selectedProjectId,
  countries,
  languages,
  searchEngines,
  onSelectProject,
  onRefresh,
  forceCreateOpen = false,
  onCloseCreate,
}) => {
  const [creating, setCreating] = useState(forceCreateOpen);
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [primaryCountry, setPrimaryCountry] = useState('EG');
  const [businessDescription, setBusinessDescription] = useState('');
  const [businessGoals, setBusinessGoals] = useState('');
  const [targets, setTargets] = useState<
    Array<{
      countryCode: string;
      languageCode: string;
      searchEngineCode: 'google' | 'yandex' | 'bing';
      device: 'desktop' | 'mobile' | 'both';
    }>
  >([{ countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' }]);

  const [mCountry, setMCountry] = useState('DE');
  const [mLang, setMLang] = useState('de');
  const [mEngine, setMEngine] = useState<'google' | 'yandex' | 'bing'>('google');
  const [mDevice, setMDevice] = useState<'desktop' | 'mobile' | 'both'>('both');
  const [compInput, setCompInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail add market/competitor state
  const [newCompDomain, setNewCompDomain] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const comps = compInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((domain) => ({ domain }));
      await api.createProject(orgId, {
        name,
        websiteUrl,
        industry,
        primaryCountryCode: primaryCountry,
        businessDescription,
        targetAudience: '',
        businessGoals,
        marketTargets: targets,
        competitors: comps,
      });
      setName('');
      setWebsiteUrl('');
      setIndustry('');
      setBusinessDescription('');
      setBusinessGoals('');
      setCompInput('');
      setCreating(false);
      onCloseCreate?.();
      await onRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (creating || forceCreateOpen) {
    const preview = resolveMarketProvider(mCountry, mLang, mEngine);
    return (
      <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 md:p-8 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-extrabold">
            {locale === 'ar' ? 'إنشاء مشروع جديد' : 'Create Multi-Market Project'}
          </h2>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              onCloseCreate?.();
            }}
            className="text-sm font-semibold text-[#52525B] hover:text-[#111111] cursor-pointer"
          >
            Cancel
          </button>
        </div>

        <form onSubmit={handleCreateProject} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-name" className="block text-xs font-bold mb-1">
                Project Name
              </label>
              <input
                id="p-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Delta Industrial Exports"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#111111]/25 text-sm"
              />
            </div>
            <div>
              <label htmlFor="p-url" className="block text-xs font-bold mb-1">
                Website URL
              </label>
              <input
                id="p-url"
                required
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://deltaind.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#111111]/25 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-ind" className="block text-xs font-bold mb-1">
                Industry
              </label>
              <input
                id="p-ind"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="B2B Manufacturing / Tourism / SaaS"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#111111]/25 text-sm"
              />
            </div>
            <div>
              <label htmlFor="p-primary" className="block text-xs font-bold mb-1">
                Primary Country
              </label>
              <select
                id="p-primary"
                value={primaryCountry}
                onChange={(e) => setPrimaryCountry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-sm"
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nameEn} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-[#111111]/15 space-y-4">
            <div className="text-sm font-bold">Target Markets (Country · Language · Search Engine)</div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
              <div>
                <label htmlFor="pm-c" className="block text-[11px] font-semibold mb-1">
                  Country
                </label>
                <select
                  id="pm-c"
                  value={mCountry}
                  onChange={(e) => {
                    const cc = e.target.value;
                    setMCountry(cc);
                    const found = countries.find((c) => c.code === cc);
                    if (found) setMLang(found.defaultLanguageCode);
                    if (cc === 'RU') setMEngine('yandex');
                    else if (mEngine === 'yandex') setMEngine('google');
                  }}
                  className="w-full px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pm-l" className="block text-[11px] font-semibold mb-1">
                  Language
                </label>
                <select
                  id="pm-l"
                  value={mLang}
                  onChange={(e) => setMLang(e.target.value)}
                  className="w-full px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
                >
                  {languages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pm-e" className="block text-[11px] font-semibold mb-1">
                  Engine
                </label>
                <select
                  id="pm-e"
                  value={mEngine}
                  onChange={(e) => setMEngine(e.target.value as 'google' | 'yandex' | 'bing')}
                  className="w-full px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
                >
                  {searchEngines.map((se) => (
                    <option key={se.code} value={se.code}>
                      {se.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pm-d" className="block text-[11px] font-semibold mb-1">
                  Device
                </label>
                <select
                  id="pm-d"
                  value={mDevice}
                  onChange={(e) => setMDevice(e.target.value as 'desktop' | 'mobile' | 'both')}
                  className="w-full px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
                >
                  <option value="both">Both</option>
                  <option value="desktop">Desktop</option>
                  <option value="mobile">Mobile</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  const dup = targets.some(
                    (t) =>
                      t.countryCode === mCountry &&
                      t.languageCode === mLang &&
                      t.searchEngineCode === mEngine
                  );
                  if (!dup) {
                    setTargets([
                      ...targets,
                      {
                        countryCode: mCountry,
                        languageCode: mLang,
                        searchEngineCode: mEngine,
                        device: mDevice,
                      },
                    ]);
                  }
                }}
                className="px-3 py-2 rounded bg-[#111111] text-[#FDFDFF] text-xs font-bold cursor-pointer"
              >
                + Add Market
              </button>
            </div>

            <div className="p-3 rounded bg-[#111111]/[0.03] text-xs space-y-1">
              <div className="font-mono font-bold">
                {preview.assignedProvider} · {preview.coverageStatus}
              </div>
              <div className="text-[#52525B]">{preview.explanationEn}</div>
            </div>

            <div className="divide-y divide-[#111111]/10 border border-[#111111]/15 rounded-lg">
              {targets.map((t, i) => (
                <div
                  key={`${t.countryCode}-${t.languageCode}-${t.searchEngineCode}`}
                  className="px-3 py-2 flex items-center justify-between text-xs"
                >
                  <span className="font-bold">
                    {t.countryCode} · {t.languageCode.toUpperCase()} · {t.searchEngineCode.toUpperCase()} ·{' '}
                    {t.device}
                  </span>
                  {targets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setTargets(targets.filter((_, idx) => idx !== i))}
                      className="text-[#F42902] font-bold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="p-comp" className="block text-xs font-bold mb-1">
              Competitor Domains (comma-separated, optional)
            </label>
            <input
              id="p-comp"
              value={compInput}
              onChange={(e) => setCompInput(e.target.value)}
              placeholder="competitor1.com, rival.de"
              className="w-full px-3.5 py-2.5 rounded-lg border border-[#111111]/25 text-sm"
            />
          </div>

          {error && (
            <div role="alert" className="p-3 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#F42902]" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-3 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] font-bold text-sm cursor-pointer disabled:opacity-60"
          >
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </form>
      </div>
    );
  }

  if (selectedProject) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className="inline-flex items-center gap-1.5 text-sm font-bold text-[#111111] hover:text-[#F42902] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Projects</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await api.deleteProject(orgId, selectedProject.id);
              onSelectProject(null);
              await onRefresh();
            }}
            className="px-3.5 py-2 rounded-lg border border-[#F42902] text-[#F42902] text-xs font-bold flex items-center gap-1.5 hover:bg-[#F42902] hover:text-[#FDFDFF] cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Project</span>
          </button>
        </div>

        <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-2">
          <h2 className="font-display text-2xl font-extrabold">{selectedProject.name}</h2>
          <div className="text-sm font-mono text-[#F42902]">{selectedProject.websiteUrl}</div>
          <p className="text-sm text-[#52525B]">
            {selectedProject.businessDescription || 'No business description provided yet.'}
          </p>
        </div>

        {detailError && (
          <div role="alert" className="p-3 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-xs">
            {detailError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
            <h3 className="font-display text-lg font-extrabold">
              Independent Market Targets ({selectedProject.marketTargets.length})
            </h3>
            <div className="divide-y divide-[#111111]/10">
              {selectedProject.marketTargets.map((m) => (
                <div key={m.id} className="py-3 flex items-start justify-between gap-3 text-sm">
                  <div>
                    <div className="font-bold">
                      {m.countryCode} · {m.languageCode.toUpperCase()} · {m.searchEngineCode.toUpperCase()}
                    </div>
                    <div className="text-xs font-mono text-[#52525B]">{m.assignedProvider}</div>
                  </div>
                  <span className="text-xs font-bold uppercase text-[#F42902]">
                    {m.coverageStatus.replace(/_/g, ' ')}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#111111]/10 flex flex-wrap gap-2">
              <select
                aria-label="Add country to project"
                value={mCountry}
                onChange={(e) => {
                  const cc = e.target.value;
                  setMCountry(cc);
                  const f = countries.find((c) => c.code === cc);
                  if (f) setMLang(f.defaultLanguageCode);
                  if (cc === 'RU') setMEngine('yandex');
                  else if (mEngine === 'yandex') setMEngine('google');
                }}
                className="px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
              >
                {countries.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.nameEn}
                  </option>
                ))}
              </select>
              <select
                aria-label="Add language to project"
                value={mLang}
                onChange={(e) => setMLang(e.target.value)}
                className="px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nameEn}
                  </option>
                ))}
              </select>
              <select
                aria-label="Add search engine to project"
                value={mEngine}
                onChange={(e) => setMEngine(e.target.value as 'google' | 'yandex' | 'bing')}
                className="px-2.5 py-2 rounded border border-[#111111]/25 text-xs bg-[#FDFDFF]"
              >
                {searchEngines.map((se) => (
                  <option key={se.code} value={se.code}>
                    {se.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={async () => {
                  setDetailError(null);
                  try {
                    await api.addProjectMarket(orgId, selectedProject.id, {
                      countryCode: mCountry,
                      languageCode: mLang,
                      searchEngineCode: mEngine,
                      device: 'both',
                    });
                    await onRefresh();
                  } catch (err) {
                    setDetailError((err as Error).message);
                  }
                }}
                className="px-3 py-2 rounded bg-[#111111] text-[#FDFDFF] text-xs font-bold cursor-pointer"
              >
                + Add Target
              </button>
            </div>
          </div>

          <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
            <h3 className="font-display text-lg font-extrabold">
              Tracked Competitors ({selectedProject.competitors.length})
            </h3>
            {selectedProject.competitors.length === 0 ? (
              <p className="text-xs text-[#52525B]">No competitors added yet.</p>
            ) : (
              <ul className="divide-y divide-[#111111]/10 text-sm">
                {selectedProject.competitors.map((c) => (
                  <li key={c.id} className="py-2.5 font-mono">
                    {c.domain}
                  </li>
                ))}
              </ul>
            )}
            <div className="pt-3 border-t border-[#111111]/10 flex gap-2">
              <input
                type="text"
                value={newCompDomain}
                onChange={(e) => setNewCompDomain(e.target.value)}
                placeholder="competitor.com"
                className="flex-1 px-3 py-2 rounded border border-[#111111]/25 text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  setDetailError(null);
                  try {
                    await api.addProjectCompetitor(orgId, selectedProject.id, {
                      domain: newCompDomain,
                    });
                    setNewCompDomain('');
                    await onRefresh();
                  } catch (err) {
                    setDetailError((err as Error).message);
                  }
                }}
                className="px-3 py-2 rounded bg-[#83FD80] text-[#111111] border border-[#111111] text-xs font-bold cursor-pointer"
              >
                Add Competitor
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Projects</h2>
          <p className="text-sm text-[#52525B]">
            Each project can target multiple countries, languages, and search engines.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2.5 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {projects.map((p) => (
          <div
            key={p.id}
            className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 flex flex-col justify-between gap-4"
          >
            <div className="space-y-2">
              <h3 className="font-display text-xl font-extrabold">{p.name}</h3>
              <div className="text-xs font-mono text-[#F42902]">{p.websiteUrl}</div>
              <div className="text-xs text-[#52525B]">
                Markets: {p.marketTargets.map((m) => `${m.countryCode}/${m.searchEngineCode}`).join(' · ')}
              </div>
            </div>
            <div className="pt-3 border-t border-[#111111]/10 flex items-center justify-between text-xs">
              <span className="font-mono text-[#52525B] tabular-nums">
                {p.competitors.length} competitors
              </span>
              <button
                type="button"
                onClick={() => onSelectProject(p.id)}
                className="font-bold text-[#111111] hover:text-[#F42902] cursor-pointer"
              >
                Open Project →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
