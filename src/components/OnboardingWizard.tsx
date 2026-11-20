import React, { useState } from 'react';
import { AlertTriangle, Check, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { DICT } from '../lib/i18n';
import { resolveMarketProvider } from '../lib/marketRules';
import type {
  BusinessType,
  CountryOption,
  LanguageOption,
  Locale,
  OrganizationSummary,
  Project,
  SearchEngineOption,
} from '../lib/types';

interface OnboardingWizardProps {
  locale: Locale;
  countries: CountryOption[];
  languages: LanguageOption[];
  searchEngines: SearchEngineOption[];
  onComplete: (org: OrganizationSummary, project: Project) => void;
  onLogout: () => void;
}

interface MarketDraft {
  countryCode: string;
  languageCode: string;
  searchEngineCode: 'google' | 'yandex' | 'bing';
  device: 'desktop' | 'mobile' | 'both';
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  locale,
  countries,
  languages,
  searchEngines,
  onComplete,
  onLogout,
}) => {
  const t = DICT[locale].onboarding;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Organization
  const [orgName, setOrgName] = useState('');
  const [businessType, setBusinessType] = useState<BusinessType>('agency');
  const [billingCountryCode, setBillingCountryCode] = useState('EG');

  // Step 2: Project
  const [projectName, setProjectName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [industry, setIndustry] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [businessGoals, setBusinessGoals] = useState('');

  // Step 3: Multi-Market Targets
  const [markets, setMarkets] = useState<MarketDraft[]>([
    { countryCode: 'EG', languageCode: 'ar', searchEngineCode: 'google', device: 'both' },
  ]);
  const [draftCountry, setDraftCountry] = useState('DE');
  const [draftLang, setDraftLang] = useState('de');
  const [draftEngine, setDraftEngine] = useState<'google' | 'yandex' | 'bing'>('google');
  const [draftDevice, setDraftDevice] = useState<'desktop' | 'mobile' | 'both'>('both');

  // Step 4: Competitors
  const [competitorInput, setCompetitorInput] = useState('');
  const [competitors, setCompetitors] = useState<string[]>([]);

  const addMarket = () => {
    const exists = markets.some(
      (m) =>
        m.countryCode === draftCountry &&
        m.languageCode === draftLang &&
        m.searchEngineCode === draftEngine
    );
    if (exists) return;
    setMarkets([
      ...markets,
      {
        countryCode: draftCountry,
        languageCode: draftLang,
        searchEngineCode: draftEngine,
        device: draftDevice,
      },
    ]);
  };

  const removeMarket = (idx: number) => {
    if (markets.length <= 1) return;
    setMarkets(markets.filter((_, i) => i !== idx));
  };

  const addCompetitor = () => {
    const clean = competitorInput.trim();
    if (!clean || competitors.includes(clean)) return;
    setCompetitors([...competitors, clean]);
    setCompetitorInput('');
  };

  const handleNext = () => {
    setError(null);
    if (step === 1 && orgName.trim().length < 2) {
      setError(locale === 'ar' ? 'أدخل اسم المؤسسة أو الوكالة' : 'Please enter your organization name.');
      return;
    }
    if (step === 2 && (projectName.trim().length < 2 || websiteUrl.trim().length < 4)) {
      setError(
        locale === 'ar'
          ? 'أدخل اسم المشروع ورابط الموقع'
          : 'Please enter both project name and website URL.'
      );
      return;
    }
    if (step < 4) setStep((step + 1) as 1 | 2 | 3 | 4);
  };

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.completeOnboarding({
        organization: {
          name: orgName.trim(),
          businessType,
          billingCountryCode,
        },
        project: {
          name: projectName.trim(),
          websiteUrl: websiteUrl.trim(),
          industry: industry.trim(),
          businessDescription: businessDescription.trim(),
          targetAudience: '',
          primaryCountryCode: markets[0]?.countryCode ?? billingCountryCode,
          businessGoals: businessGoals.trim(),
          marketTargets: markets,
          competitors: competitors.map((domain) => ({ domain })),
        },
      });
      onComplete(res.organization, res.project);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const draftResolution = resolveMarketProvider(draftCountry, draftLang, draftEngine);

  return (
    <div className="min-h-screen bg-[#F42902] kitchen-grid-pattern-red py-10 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 text-[#FDFDFF]">
          <span className="font-display text-xl font-extrabold">EL MATBA5 · المطبخ</span>
          <button
            type="button"
            onClick={onLogout}
            className="text-sm font-semibold underline hover:text-[#83FD80] cursor-pointer"
          >
            {locale === 'ar' ? 'تسجيل الخروج' : 'Log out'}
          </button>
        </div>

        <div className="bg-[#FDFDFF] border-2 border-[#111111] rounded-xl p-6 md:p-10 space-y-8">
          <div className="space-y-2 border-b border-[#111111]/10 pb-6">
            <h1 className="font-display text-3xl font-extrabold text-[#111111]">{t.title}</h1>
            <p className="text-sm text-[#52525B]">{t.subtitle}</p>
            <div className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
              {[
                { num: 1, label: t.stepOrg },
                { num: 2, label: t.stepProject },
                { num: 3, label: t.stepMarkets },
                { num: 4, label: t.stepReady },
              ].map((s) => (
                <div
                  key={s.num}
                  className={`px-3 py-2 rounded-md border ${
                    step === s.num
                      ? 'bg-[#83FD80] text-[#111111] border-[#111111]'
                      : step > s.num
                      ? 'bg-[#111111] text-[#FDFDFF] border-[#111111]'
                      : 'bg-[#FDFDFF] text-[#52525B] border-[#111111]/20'
                  }`}
                >
                  {s.label}
                </div>
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label htmlFor="onb-org" className="block text-sm font-semibold mb-1.5">
                  {t.orgName}
                </label>
                <input
                  id="onb-org"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Cairo Growth Studio"
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="onb-type" className="block text-sm font-semibold mb-1.5">
                    {t.businessType}
                  </label>
                  <select
                    id="onb-type"
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value as BusinessType)}
                    className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF]"
                  >
                    <option value="agency">Digital / SEO Agency</option>
                    <option value="consultant">Independent Consultant</option>
                    <option value="business">In-House Business</option>
                    <option value="ecommerce">E-Commerce Brand</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="onb-country" className="block text-sm font-semibold mb-1.5">
                    {t.billingCountry}
                  </label>
                  <select
                    id="onb-country"
                    value={billingCountryCode}
                    onChange={(e) => setBillingCountryCode(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF]"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {locale === 'ar' ? c.nameAr : c.nameEn} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <p className="text-xs text-[#52525B]">
                {locale === 'ar'
                  ? 'ملاحظة: دولة الفوترة منفصلة تماماً عن أسواق البحث المستهدفة لمشاريعك.'
                  : 'Note: Billing country is completely independent from the international search markets your projects target.'}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="onb-proj" className="block text-sm font-semibold mb-1.5">
                    {t.projectName}
                  </label>
                  <input
                    id="onb-proj"
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Kemet Organic Exports"
                    className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                  />
                </div>
                <div>
                  <label htmlFor="onb-url" className="block text-sm font-semibold mb-1.5">
                    {t.websiteUrl}
                  </label>
                  <input
                    id="onb-url"
                    type="text"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="onb-ind" className="block text-sm font-semibold mb-1.5">
                    {t.industry}
                  </label>
                  <input
                    id="onb-ind"
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="B2B SaaS / Hospitality / E-commerce"
                    className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                  />
                </div>
                <div>
                  <label htmlFor="onb-goals" className="block text-sm font-semibold mb-1.5">
                    {t.goals}
                  </label>
                  <input
                    id="onb-goals"
                    type="text"
                    value={businessGoals}
                    onChange={(e) => setBusinessGoals(e.target.value)}
                    placeholder="Increase European & Gulf organic leads"
                    className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="onb-desc" className="block text-sm font-semibold mb-1.5">
                  {t.description}
                </label>
                <textarea
                  id="onb-desc"
                  rows={3}
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.target.value)}
                  placeholder="Describe products, services, and target buyers..."
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label htmlFor="m-country" className="block text-xs font-semibold mb-1">
                    Country
                  </label>
                  <select
                    id="m-country"
                    value={draftCountry}
                    onChange={(e) => {
                      const nextCc = e.target.value;
                      setDraftCountry(nextCc);
                      const found = countries.find((c) => c.code === nextCc);
                      if (found) setDraftLang(found.defaultLanguageCode);
                      if (nextCc === 'RU') setDraftEngine('yandex');
                      else if (draftEngine === 'yandex') setDraftEngine('google');
                    }}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-sm"
                  >
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.nameEn} ({c.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="m-lang" className="block text-xs font-semibold mb-1">
                    Language
                  </label>
                  <select
                    id="m-lang"
                    value={draftLang}
                    onChange={(e) => setDraftLang(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-sm"
                  >
                    {languages.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.nameEn} ({l.nameNative})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="m-engine" className="block text-xs font-semibold mb-1">
                    Search Engine
                  </label>
                  <select
                    id="m-engine"
                    value={draftEngine}
                    onChange={(e) =>
                      setDraftEngine(e.target.value as 'google' | 'yandex' | 'bing')
                    }
                    className="w-full px-3 py-2.5 rounded-lg border border-[#111111]/25 bg-[#FDFDFF] text-sm"
                  >
                    {searchEngines.map((se) => (
                      <option key={se.code} value={se.code}>
                        {se.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={addMarket}
                  className="px-4 py-2.5 rounded-lg bg-[#111111] text-[#FDFDFF] text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#F42902] transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t.addMarket}</span>
                </button>
              </div>

              <div className="p-3.5 rounded-lg border border-[#111111]/15 bg-[#111111]/[0.03] text-xs space-y-1">
                <div className="flex items-center justify-between font-bold">
                  <span>
                    Provider Route: <span className="font-mono">{draftResolution.assignedProvider}</span>
                  </span>
                  <span className="uppercase">{draftResolution.coverageStatus.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-[#52525B]">
                  {locale === 'ar' ? draftResolution.explanationAr : draftResolution.explanationEn}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-bold">Active Market Targets ({markets.length})</h3>
                <div className="divide-y divide-[#111111]/10 border border-[#111111]/15 rounded-lg">
                  {markets.map((m, idx) => {
                    const res = resolveMarketProvider(
                      m.countryCode,
                      m.languageCode,
                      m.searchEngineCode
                    );
                    return (
                      <div
                        key={`${m.countryCode}-${m.languageCode}-${m.searchEngineCode}`}
                        className="p-3.5 flex items-center justify-between gap-4 text-sm"
                      >
                        <div className="space-y-0.5">
                          <div className="font-bold">
                            {m.countryCode} · {m.languageCode.toUpperCase()} · {m.searchEngineCode.toUpperCase()}
                          </div>
                          <div className="text-xs text-[#52525B] font-mono">
                            {res.assignedProvider} ({res.coverageStatus})
                          </div>
                        </div>
                        {markets.length > 1 && (
                          <button
                            type="button"
                            aria-label={`Remove ${m.countryCode} market`}
                            onClick={() => removeMarket(idx)}
                            className="p-2 text-[#52525B] hover:text-[#F42902] cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <label htmlFor="onb-comp" className="block text-sm font-semibold mb-1.5">
                  {t.competitors} (Optional)
                </label>
                <div className="flex gap-2">
                  <input
                    id="onb-comp"
                    type="text"
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCompetitor();
                      }
                    }}
                    placeholder="competitor-domain.com"
                    className="flex-1 px-4 py-2.5 rounded-lg border border-[#111111]/25 focus:outline-none focus:border-[#F42902]"
                  />
                  <button
                    type="button"
                    onClick={addCompetitor}
                    className="px-4 py-2.5 rounded-lg bg-[#111111] text-[#FDFDFF] text-sm font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {competitors.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
                    {competitors.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setCompetitors(competitors.filter((item) => item !== c))}
                        className="px-3 py-1.5 rounded border border-[#111111]/20 hover:border-[#F42902] cursor-pointer"
                      >
                        {c} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 rounded-lg bg-[#83FD80]/20 border border-[#111111]/20 text-sm space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  <span>Ready to initialize multi-tenant kitchen</span>
                </div>
                <p className="text-xs text-[#52525B]">
                  Integrations (Google Search Console, GA4, DataForSEO, Yandex Webmaster) can be
                  connected anytime from the Integrations panel—you can explore your workspace
                  immediately.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-sm font-medium flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#F42902] shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-4 border-t border-[#111111]/10 flex items-center justify-between">
            <button
              type="button"
              disabled={step === 1}
              onClick={() => setStep((step - 1) as 1 | 2 | 3 | 4)}
              className="px-5 py-2.5 rounded-lg border border-[#111111]/25 text-sm font-bold disabled:opacity-40 cursor-pointer"
            >
              {t.back}
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-lg bg-[#111111] text-[#FDFDFF] text-sm font-bold hover:bg-[#F42902] transition-colors cursor-pointer"
              >
                {t.next}
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="px-6 py-2.5 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] text-sm font-bold hover:bg-[#9eff9b] transition-colors cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Saving...' : t.finish}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
