import React, { useState } from 'react';
import { ArrowRight, Check, Globe2, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { DICT } from '../lib/i18n';
import type { Locale, PlanDefinition } from '../lib/types';
import type { PublicRoute } from './PublicHeader';

interface PublicSiteProps {
  route: Exclude<PublicRoute, 'login' | 'signup'>;
  locale: Locale;
  plans: PlanDefinition[];
  onToggleLocale: (next: Locale) => void;
  onNavigate: (route: PublicRoute) => void;
}

const CAPABILITY_PILLARS = [
  {
    num: '01.',
    route: 'seo' as PublicRoute,
    titleEn: 'SEO Research & Rank Tracking',
    titleAr: 'أبحاث الكلمات وتتبع الترتيب',
    descEn:
      'Country-specific keyword discovery, intent clustering, SERP snapshots, and daily ranking history across Google, Bing, and Yandex.',
    descAr:
      'اكتشاف الكلمات المفتاحية حسب الدولة واللغة، وتحليل نية البحث، وتتبع الترتيب عبر جوجل وبينج وياندكس.',
    meta: 'DataForSEO · Search Console · Yandex API',
  },
  {
    num: '02.',
    route: 'seo' as PublicRoute,
    titleEn: 'Technical Site Crawler',
    titleAr: 'الفحص التقني للمواقع',
    descEn:
      'Robots.txt & sitemap discovery, canonicals, status codes, broken links, heading hierarchy, and prioritized severity fixes.',
    descAr:
      'فحص خرائط الموقع والروابط المعطلة والوسوم المتكررة وسرعة الأرشفة مع ترتيب الأولويات.',
    meta: 'Critical / High / Medium / Low Triage',
  },
  {
    num: '03.',
    route: 'geo' as PublicRoute,
    titleEn: 'GEO — AI Search Visibility',
    titleAr: 'الظهور في محركات الذكاء الاصطناعي GEO',
    descEn:
      'Monitor brand mentions, competitor share, and citation URLs across AI answers with explicit numerators, denominators, and timestamps.',
    descAr:
      'تتبع ذكر العلامة التجارية وروابط الاستشهاد في إجابات الذكاء الاصطناعي بشفافية ومنهجية واضحة.',
    meta: 'Observed Snapshots · Zero Magic Switches',
  },
  {
    num: '04.',
    route: 'aeo' as PublicRoute,
    titleEn: 'AEO & Content Studio',
    titleAr: 'تحسين الإجابات AEO واستوديو المحتوى',
    descEn:
      'Question discovery, FAQ structure, entity coverage, and bilingual Arabic/English editorial briefs reviewed by humans before publishing.',
    descAr:
      'صياغة إجابات واضحة وبناء خطط محتوى بالعربية والإنجليزية مع مراجعة بشرية قبل النشر.',
    meta: 'Arabic RTL · English LTR · Multi-Language',
  },
  {
    num: '05.',
    route: 'agents' as PublicRoute,
    titleEn: 'Specialized AI Marketing Agents',
    titleAr: 'وكلاء الذكاء الاصطناعي المتخصصون',
    descEn:
      'Eight domain-scoped analysts (SEO, Keyword, Competitor, GEO, AEO, Content, Technical, Reporting) grounded strictly in real evidence.',
    descAr:
      'ثمانية وكلاء متخصصين يعملون بأدوات معتمدة ويشرحون مصادر البيانات وعدم اليقين دون اختلاق أرقام.',
    meta: 'Gemini Server-Side Orchestration',
  },
  {
    num: '06.',
    route: 'product' as PublicRoute,
    titleEn: 'Multi-Tenant Agency Command',
    titleAr: 'إدارة متعددة المؤسسات والعملاء',
    descEn:
      'Dedicated organizations, role-based access, client workspaces, usage quotas, audit logs, and GDPR-ready self-service exports.',
    descAr:
      'عزل كامل لبيانات كل وكالة أو عميل مع صلاحيات الفريق وسجلات التدقيق وتصدير البيانات.',
    meta: 'Organization Isolation · Audit Trail',
  },
];

export const PublicSite: React.FC<PublicSiteProps> = ({
  route,
  locale,
  plans,
  onToggleLocale,
  onNavigate,
}) => {
  const t = DICT[locale];
  const [currency, setCurrency] = useState<'EGP' | 'USD'>('EGP');

  // Contact form state
  const [cName, setCName] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cCompany, setCCompany] = useState('');
  const [cCountry, setCCountry] = useState('EG');
  const [cMsg, setCMsg] = useState('');
  const [cSubmitting, setCSubmitting] = useState(false);
  const [cSuccess, setCSuccess] = useState<string | null>(null);
  const [cError, setCError] = useState<string | null>(null);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCError(null);
    setCSuccess(null);
    setCSubmitting(true);
    try {
      const res = await api.submitContactLead({
        fullName: cName,
        email: cEmail,
        company: cCompany,
        countryCode: cCountry,
        message: cMsg,
      });
      setCSuccess(
        locale === 'ar'
          ? `تم استلام رسالتك بنجاح (رقم المرجع: ${res.id.slice(0, 8)}).`
          : `Message received and stored securely (Ref: ${res.id.slice(0, 8)}).`
      );
      setCName('');
      setCEmail('');
      setCCompany('');
      setCMsg('');
    } catch (err) {
      setCError((err as Error).message);
    } finally {
      setCSubmitting(false);
    }
  };

  if (route === 'pricing') {
    return (
      <main className="bg-[#FDFDFF] text-[#111111]">
        <section className="bg-[#F42902] text-[#FDFDFF] py-20 px-6 border-b border-[#111111]/15">
          <div className="max-w-[1320px] mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#83FD80]">
                {locale === 'ar' ? 'الأسعار والباقات' : 'Commercial Plans'}
              </p>
              <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.05]">
                {t.sections.pricingTitle}
              </h1>
              <p className="text-base text-[#FDFDFF]/90">{t.sections.pricingSub}</p>
            </div>
            <div className="inline-flex rounded-lg bg-[#111111] p-1 shrink-0 self-start">
              <button
                type="button"
                onClick={() => setCurrency('EGP')}
                className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer ${
                  currency === 'EGP' ? 'bg-[#83FD80] text-[#111111]' : 'text-[#FDFDFF]'
                }`}
              >
                EGP (Egypt)
              </button>
              <button
                type="button"
                onClick={() => setCurrency('USD')}
                className={`px-4 py-2 text-xs font-bold rounded-md cursor-pointer ${
                  currency === 'USD' ? 'bg-[#83FD80] text-[#111111]' : 'text-[#FDFDFF]'
                }`}
              >
                USD (Global)
              </button>
            </div>
          </div>
        </section>

        <section className="max-w-[1320px] mx-auto px-6 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan, idx) => {
              const highlighted = idx === 1;
              return (
                <div
                  key={plan.id}
                  className={`rounded-xl border-2 border-[#111111] p-8 flex flex-col justify-between gap-8 ${
                    highlighted ? 'bg-[#F42902] text-[#FDFDFF]' : 'bg-[#FDFDFF] text-[#111111]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="text-xs font-bold uppercase tracking-wider opacity-80">
                      {plan.id.toUpperCase()}
                    </div>
                    <h2 className="font-display text-2xl font-extrabold">{plan.name}</h2>
                    <p
                      className={`text-sm ${
                        highlighted ? 'text-[#FDFDFF]/90' : 'text-[#52525B]'
                      }`}
                    >
                      {plan.description}
                    </p>
                    <div className="pt-2 font-display text-4xl font-extrabold tabular-nums">
                      {currency === 'EGP'
                        ? `${plan.priceEgpMonthly.toLocaleString()} EGP`
                        : `$${plan.priceUsdMonthly}`}
                      <span className="text-sm font-medium opacity-75"> / month</span>
                    </div>

                    <ul className="pt-4 space-y-2.5 text-sm border-t border-current/15 tabular-nums">
                      <li className="flex justify-between">
                        <span>Active Projects</span>
                        <span className="font-mono font-bold">{plan.maxProjects}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>Tracked Keywords</span>
                        <span className="font-mono font-bold">
                          {plan.maxKeywords.toLocaleString()}
                        </span>
                      </li>
                      <li className="flex justify-between">
                        <span>Monthly Crawls</span>
                        <span className="font-mono font-bold">{plan.maxCrawlsMonthly}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>GEO Monitoring Runs</span>
                        <span className="font-mono font-bold">{plan.maxGeoRunsMonthly}</span>
                      </li>
                      <li className="flex justify-between">
                        <span>AI Credits / mo</span>
                        <span className="font-mono font-bold">
                          {plan.maxAiCreditsMonthly.toLocaleString()}
                        </span>
                      </li>
                      <li className="flex justify-between">
                        <span>Team Seats</span>
                        <span className="font-mono font-bold">{plan.maxTeamMembers}</span>
                      </li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate('signup')}
                    className={`w-full py-3.5 px-5 rounded-lg font-bold text-sm border border-[#111111] transition-colors cursor-pointer ${
                      highlighted
                        ? 'bg-[#83FD80] text-[#111111] hover:bg-[#9eff9b]'
                        : 'bg-[#111111] text-[#FDFDFF] hover:bg-[#F42902]'
                    }`}
                  >
                    {locale === 'ar' ? 'ابدأ بهذه الباقة' : `Start with ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-8 text-xs text-[#52525B]">
            Note: Plans reflect initial commercial structure. Paymob Egypt checkout and automated
            server-side webhook billing activate in Phase 6; Phase 1 accounts start with full
            multi-tenant workspace access.
          </p>
        </section>
      </main>
    );
  }

  if (route === 'contact') {
    return (
      <main className="bg-[#FDFDFF] text-[#111111] py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#F42902]">
              {locale === 'ar' ? 'تواصل مع المطبخ' : 'Talk to the Kitchen'}
            </p>
            <h1 className="font-display text-4xl font-extrabold">
              {locale === 'ar' ? 'تواصل مع فريق EL MATBA5' : 'Contact EL MATBA5'}
            </h1>
            <p className="text-base text-[#52525B]">
              {locale === 'ar'
                ? 'للوكالات، الشراكات، أو الأسئلة حول التكاملات والأسواق الدولية.'
                : 'Questions about agency plans, Paymob billing, DataForSEO/Yandex market coverage, or enterprise onboarding.'}
            </p>
          </div>

          <form
            onSubmit={handleContactSubmit}
            className="border-2 border-[#111111] rounded-xl p-8 space-y-5 bg-[#FDFDFF]"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="c-name" className="block text-sm font-semibold mb-1.5">
                  Full Name
                </label>
                <input
                  id="c-name"
                  required
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25"
                />
              </div>
              <div>
                <label htmlFor="c-email" className="block text-sm font-semibold mb-1.5">
                  Email
                </label>
                <input
                  id="c-email"
                  type="email"
                  required
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="c-company" className="block text-sm font-semibold mb-1.5">
                  Agency / Company
                </label>
                <input
                  id="c-company"
                  value={cCompany}
                  onChange={(e) => setCCompany(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25"
                />
              </div>
              <div>
                <label htmlFor="c-country" className="block text-sm font-semibold mb-1.5">
                  Country
                </label>
                <select
                  id="c-country"
                  value={cCountry}
                  onChange={(e) => setCCountry(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-[#111111]/25 bg-[#FDFDFF]"
                >
                  <option value="EG">Egypt (EG)</option>
                  <option value="SA">Saudi Arabia (SA)</option>
                  <option value="AE">UAE (AE)</option>
                  <option value="GB">United Kingdom (GB)</option>
                  <option value="DE">Germany (DE)</option>
                  <option value="RU">Russia (RU)</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="c-msg" className="block text-sm font-semibold mb-1.5">
                How can we help?
              </label>
              <textarea
                id="c-msg"
                rows={4}
                required
                minLength={10}
                value={cMsg}
                onChange={(e) => setCMsg(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-[#111111]/25"
              />
            </div>

            {cError && (
              <div role="alert" className="p-3 rounded-lg bg-[#F42902]/10 border border-[#F42902] text-sm">
                {cError}
              </div>
            )}
            {cSuccess && (
              <div role="status" className="p-3 rounded-lg bg-[#83FD80]/30 border border-[#111111] text-sm font-semibold">
                {cSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={cSubmitting}
              className="px-6 py-3.5 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] font-bold text-sm flex items-center gap-2 cursor-pointer"
            >
              {cSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Send Message</span>
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (route === 'privacy' || route === 'terms') {
    return (
      <main className="bg-[#FDFDFF] text-[#111111] py-16 px-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <p className="text-xs font-bold uppercase tracking-wider text-[#F42902]">
            Legal Readiness · GDPR · Egypt · International
          </p>
          <h1 className="font-display text-4xl font-extrabold">
            {route === 'privacy'
              ? 'Privacy Policy & GDPR Architecture'
              : 'Terms of Service & Acceptable Crawling'}
          </h1>
          <div className="border border-[#111111]/20 rounded-xl p-6 space-y-4 text-sm leading-relaxed text-[#52525B]">
            <p className="text-[#111111] font-semibold">
              Notice: This compliance baseline requires formal review by qualified legal counsel
              across Egypt, the EU (GDPR), and target markets prior to commercial launch.
            </p>
            {route === 'privacy' ? (
              <>
                <p>
                  <strong>1. Multi-Tenant Isolation:</strong> All project data, competitors, audit
                  logs, and market metrics are strictly partitioned by <code>organization_id</code>{' '}
                  and verified server-side on every API call.
                </p>
                <p>
                  <strong>2. Data Subject Rights & Portability:</strong> Organization admins can
                  export complete JSON records of their organization, projects, members, and audit
                  logs directly from Settings.
                </p>
                <p>
                  <strong>3. Credential & Secret Security:</strong> Passwords are hashed using
                  per-user salted <code>scrypt</code>; third-party OAuth tokens and API keys remain
                  strictly server-side.
                </p>
              </>
            ) : (
              <>
                <p>
                  <strong>1. Ethical Crawling Policy:</strong> Technical SEO crawls honor{' '}
                  <code>robots.txt</code>, crawl rate limits, and never bypass authentication
                  barriers without explicit site ownership authorization.
                </p>
                <p>
                  <strong>2. Data Methodology Transparency:</strong> EL MATBA5 labels measured
                  first-party metrics, third-party provider estimates, and demonstration previews
                  separately without fabricating search volumes or AI visibility guarantees.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (route !== 'home') {
    const pageCopy: Record<
      Exclude<PublicRoute, 'home' | 'pricing' | 'contact' | 'privacy' | 'terms' | 'login' | 'signup'>,
      { kicker: string; title: string; body: string; bullets: string[] }
    > = {
      product: {
        kicker: 'Product Architecture',
        title: 'One kitchen. Eight marketing disciplines.',
        body: 'EL MATBA5 replaces fragmented SEO spreadsheets, rank trackers, crawler tabs, and disconnected AI prompts with a single multi-tenant workspace built for agencies and growth teams.',
        bullets: [
          'Strict organization-level tenant isolation from day one',
          'Independent project billing country vs. international search markets',
          'Bilingual Arabic (RTL) and English (LTR) product experience',
        ],
      },
      features: {
        kicker: 'Full Platform Menu',
        title: 'Every ingredient for modern search & AI growth.',
        body: 'Designed in six controlled engineering phases so every connected module relies on verified providers and explicit data methodology.',
        bullets: [
          'Multi-market project management (Egypt, Saudi, UAE, UK, EU, Russia)',
          'Technical SEO crawler with severity-ranked recommendations',
          'GEO & AEO monitoring with transparent citation denominators',
        ],
      },
      seo: {
        kicker: 'Traditional Search & Technical Audits',
        title: 'SEO Research, Rank Tracking & Site Crawls.',
        body: 'Track desktop and mobile rankings per country, language, and search engine—while diagnosing canonicals, hreflang, broken links, and structured data.',
        bullets: [
          'DataForSEO integration architecture for Google markets',
          'Yandex Search API & Yandex Webmaster routing for Russia',
          'First-party Google Search Console & Bing Webmaster connectors',
        ],
      },
      geo: {
        kicker: 'Generative Engine Optimization',
        title: 'Measure how AI answers mention and cite your brand.',
        body: 'Track prompts relevant to your buyers across languages and markets. We distinguish observed public results from simulated answers and never sell fake "GEO switches".',
        bullets: [
          'Explicit mention rates and citation URL numerators/denominators',
          'Competitor co-mention and sentiment tracking',
          'Historical observation snapshots with provider attribution',
        ],
      },
      aeo: {
        kicker: 'Answer Engine Optimization',
        title: 'Structure authoritative answers search engines trust.',
        body: 'Identify buyer questions, FAQ gaps, entity coverage, and clean schema recommendations grounded in search documentation.',
        bullets: [
          'Question & FAQ opportunity discovery by market language',
          'Entity coverage & topical authority mapping',
          'Human-reviewed content briefs in Arabic and English',
        ],
      },
      agents: {
        kicker: 'Specialized AI Brigade',
        title: 'Eight domain analysts, zero invented numbers.',
        body: 'Our Gemini-powered orchestrator delegates tasks to specialized SEO, Keyword, Competitor, GEO, AEO, Content, Technical, and Reporting agents—each bound to real project evidence.',
        bullets: [
          'Structured JSON outputs citing exact data sources',
          'Explicit uncertainty reporting when data is unavailable',
          'Human approval required before any external publishing action',
        ],
      },
      about: {
        kicker: 'Born in Cairo · Built for the World',
        title: 'Egyptian wit. Global engineering discipline.',
        body: 'In Egypt, "El Matba5" (المطبخ) is where raw ingredients become something unforgettable. We built this platform for ambitious MENA agencies, exporters, and SEO professionals competing worldwide.',
        bullets: [
          'Built specifically around multi-country agency workflows',
          'Arabic RTL and English LTR treated as first-class citizens',
          'Honest telemetry: never fake metrics, never silently swap markets',
        ],
      },
    };

    const current = pageCopy[route];
    return (
      <main className="bg-[#FDFDFF] text-[#111111]">
        <section className="bg-[#F42902] text-[#FDFDFF] py-20 px-6 border-b border-[#111111]/15">
          <div className="max-w-[1320px] mx-auto max-w-3xl space-y-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#83FD80]">
              {current.kicker}
            </p>
            <h1 className="font-display text-4xl md:text-6xl font-extrabold leading-[1.06]">
              {current.title}
            </h1>
            <p className="text-lg text-[#FDFDFF]/90 leading-relaxed">{current.body}</p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('signup')}
                className="px-6 py-3.5 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] font-bold text-sm cursor-pointer"
              >
                {t.hero.primaryCta}
              </button>
              <button
                type="button"
                onClick={() => onNavigate('pricing')}
                className="px-6 py-3.5 rounded-lg bg-[#FDFDFF] text-[#111111] border border-[#111111] font-bold text-sm cursor-pointer"
              >
                {t.nav.pricing}
              </button>
            </div>
          </div>
        </section>

        <section className="max-w-[1320px] mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-6 space-y-4">
            <h2 className="font-display text-2xl font-extrabold">Key Capabilities</h2>
            <ul className="space-y-3">
              {current.bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-base">
                  <span className="mt-1 p-1 rounded bg-[#83FD80] text-[#111111] shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-6">
            <div className="rounded-xl overflow-hidden border-2 border-[#111111] bg-[#F42902]/10 aspect-[4/3]">
              <img
                src="/src/assets/images/geo_ai_visibility_1795184592699.jpg"
                alt="EL MATBA5 optical glass prisms representing AI search and multi-market intelligence"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </section>
      </main>
    );
  }

  // HOME PAGE (60% Red Orange #F42902, 30% Snowy White #FDFDFF, 10% Yellow Punk #83FD80)
  return (
    <main className="bg-[#FDFDFF] text-[#111111]">
      {/* Hero Section — Dominant Red Orange #F42902 Canvas */}
      <section className="bg-[#F42902] text-[#FDFDFF] kitchen-grid-pattern-red border-b-2 border-[#111111]">
        <div className="max-w-[1320px] mx-auto px-6 py-12 lg:py-20">
          {/* Sub-header utility strip (locale switcher + login link outside Top Bar) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-8 mb-8 border-b border-[#FDFDFF]/20 text-xs font-semibold">
            <div className="flex items-center gap-3 text-[#FDFDFF]">
              <span>EL MATBA5 · المطبخ</span>
              <span aria-hidden="true">·</span>
              <span>{t.hero.kicker}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="inline-flex rounded-md border border-[#FDFDFF]/30 p-0.5 bg-[#111111]/20">
                <button
                  type="button"
                  onClick={() => onToggleLocale('en')}
                  className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                    locale === 'en' ? 'bg-[#83FD80] text-[#111111]' : 'text-[#FDFDFF]'
                  }`}
                >
                  EN
                </button>
                <button
                  type="button"
                  onClick={() => onToggleLocale('ar')}
                  className={`px-2.5 py-1 rounded text-xs font-bold cursor-pointer ${
                    locale === 'ar' ? 'bg-[#83FD80] text-[#111111]' : 'text-[#FDFDFF]'
                  }`}
                >
                  عربي
                </button>
              </div>
              <a
                href="#login"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate('login');
                }}
                className="text-[#FDFDFF] hover:text-[#83FD80] underline underline-offset-4 whitespace-nowrap"
              >
                {t.nav.login}
              </a>
            </div>
          </div>

          {/* 2-Column Editorial Hero Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between space-y-8">
              <div className="space-y-6">
                <p className="font-mono text-sm font-bold tracking-wider uppercase text-[#83FD80]">
                  {t.tagline}
                </p>
                <h1
                  className="font-display font-extrabold tracking-tight text-[#FDFDFF]"
                  style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)', lineHeight: 1.02 }}
                >
                  {t.hero.headline}
                </h1>
                <p className="text-lg md:text-xl text-[#FDFDFF]/95 max-w-2xl leading-relaxed">
                  {t.hero.subhead}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onNavigate('signup')}
                    className="px-7 py-4 rounded-lg bg-[#83FD80] text-[#111111] border-2 border-[#111111] font-extrabold text-base flex items-center gap-2 hover:bg-[#9eff9b] transition-colors cursor-pointer"
                  >
                    <span>{t.hero.primaryCta}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('product')}
                    className="px-7 py-4 rounded-lg bg-[#FDFDFF] text-[#111111] border-2 border-[#111111] font-bold text-base hover:bg-[#111111] hover:text-[#FDFDFF] transition-colors cursor-pointer"
                  >
                    {t.hero.secondaryCta}
                  </button>
                </div>
                <p className="text-xs font-medium text-[#FDFDFF]/85">{t.hero.egyptBadge}</p>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border-2 border-[#111111] bg-[#111111]">
                <img
                  src="/src/assets/images/hero_kitchen_intelligence_1795184592476.jpg"
                  alt="EL MATBA5 editorial strategy kitchen with red-orange architectural walls and white worktable"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Full-width 4-column proof/architecture strip below hero */}
          <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Target Regions', val: 'EG · MENA · EU · RU' },
              { label: 'Search Engines', val: 'Google · Yandex · Bing' },
              { label: 'Interfaces', val: 'Arabic RTL & English LTR' },
              { label: 'Data Policy', val: 'Zero Fabricated Metrics' },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-[#FDFDFF] text-[#111111] border-2 border-[#111111] rounded-lg p-4"
              >
                <div className="text-xs font-semibold text-[#52525B]">{item.label}</div>
                <div className="mt-1 font-display text-base font-extrabold">{item.val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2: Capabilities Grid on Snowy White #FDFDFF */}
      <section className="bg-[#FDFDFF] py-20 px-6 border-b border-[#111111]/10">
        <div className="max-w-[1320px] mx-auto space-y-12">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#F42902]">
              {locale === 'ar' ? 'قائمة المطبخ' : 'Inside the Kitchen'}
            </p>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold tracking-tight">
              {t.sections.kitchenTitle}
            </h2>
            <p className="text-base text-[#52525B] leading-relaxed">{t.sections.kitchenSub}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CAPABILITY_PILLARS.map((cap) => (
              <article
                key={cap.num}
                className="border border-[#111111]/20 rounded-xl p-7 bg-[#FDFDFF] flex flex-col justify-between gap-6 hover:border-[#F42902] transition-colors"
              >
                <div className="space-y-3">
                  <div className="font-mono text-sm font-bold text-[#F42902]">{cap.num}</div>
                  <h3 className="font-display text-xl font-extrabold">
                    {locale === 'ar' ? cap.titleAr : cap.titleEn}
                  </h3>
                  <p className="text-sm text-[#52525B] leading-relaxed">
                    {locale === 'ar' ? cap.descAr : cap.descEn}
                  </p>
                </div>
                <div className="pt-4 border-t border-[#111111]/10 flex items-center justify-between text-xs text-[#52525B]">
                  <span className="font-mono">{cap.meta}</span>
                  <button
                    type="button"
                    onClick={() => onNavigate(cap.route)}
                    className="font-bold text-[#111111] hover:text-[#F42902] cursor-pointer"
                  >
                    {locale === 'ar' ? 'التفاصيل' : 'Explore'} →
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Global Markets & Cairo-to-World Architecture */}
      <section className="bg-[#F42902] text-[#FDFDFF] py-20 px-6 border-y-2 border-[#111111]">
        <div className="max-w-[1320px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#83FD80]">
              <Globe2 className="w-4 h-4" />
              <span>Multi-Market Provider Registry</span>
            </div>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold leading-tight">
              {t.sections.marketsTitle}
            </h2>
            <p className="text-base text-[#FDFDFF]/95 leading-relaxed">{t.sections.marketsSub}</p>

            <div className="bg-[#FDFDFF] text-[#111111] border-2 border-[#111111] rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-[#111111] text-[#FDFDFF] text-xs font-bold flex justify-between">
                <span>Example Multi-Market Project</span>
                <span className="font-mono text-[#83FD80]">1 Project · 4 Markets</span>
              </div>
              <div className="divide-y divide-[#111111]/10 text-sm">
                {[
                  { m: 'Egypt · Arabic · Google', p: 'DataForSEO + Search Console', st: 'Supported' },
                  { m: 'Germany · German · Google', p: 'DataForSEO + Search Console', st: 'Supported' },
                  { m: 'UK · English · Google', p: 'DataForSEO + Search Console', st: 'Supported' },
                  { m: 'Russia · Russian · Yandex', p: 'Yandex Search & Webmaster', st: 'Explicit Route' },
                ].map((row) => (
                  <div key={row.m} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold">{row.m}</div>
                      <div className="text-xs font-mono text-[#52525B]">{row.p}</div>
                    </div>
                    <span className="text-xs font-bold text-[#F42902]">{row.st}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-xl overflow-hidden border-2 border-[#111111] aspect-[4/3] bg-[#111111]">
              <img
                src="/src/assets/images/egypt_global_reach_1795184592881.jpg"
                alt="Cairo creative marketing agency studio overlooking the Nile with red-orange structural beams"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Security & Closing CTA on Snowy White */}
      <section className="bg-[#FDFDFF] py-20 px-6">
        <div className="max-w-[1320px] mx-auto border-2 border-[#111111] rounded-xl p-8 md:p-14 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 kitchen-grid-pattern">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#F42902]">
              <ShieldCheck className="w-4 h-4" />
              <span>Multi-Tenant · GDPR-Ready · Egyptian Soul</span>
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-extrabold">
              {locale === 'ar'
                ? 'جاهز تفتح مطبخ النمو الخاص بوكالتك؟'
                : 'Ready to cook real organic growth?'}
            </h2>
            <p className="text-base text-[#52525B]">
              {locale === 'ar'
                ? 'أنشئ مؤسستك ومشروعك الأول وحدد أسواقك الدولية في أقل من دقيقتين.'
                : 'Create your organization, configure multi-country search markets, and organize competitors in under two minutes.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('signup')}
              className="px-7 py-4 rounded-lg bg-[#83FD80] text-[#111111] border-2 border-[#111111] font-extrabold text-sm hover:bg-[#9eff9b] transition-colors cursor-pointer"
            >
              {t.hero.primaryCta}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contact')}
              className="px-7 py-4 rounded-lg bg-[#111111] text-[#FDFDFF] font-bold text-sm hover:bg-[#F42902] transition-colors cursor-pointer"
            >
              {locale === 'ar' ? 'تواصل معنا' : 'Contact Team'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
};
