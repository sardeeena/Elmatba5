import React from 'react';
import { DEMO_DATASET } from '../data/demoData';
import type { Project } from '../lib/types';

interface ModulePreviewsProps {
  section: string;
  projects: Project[];
  demoMode: boolean;
  onToggleDemoMode: (v: boolean) => void;
}

const MODULE_META: Record<
  string,
  { title: string; phase: string; summary: string; requiredProviders: string }
> = {
  keywords: {
    title: 'Keyword Research',
    phase: 'Phase 2',
    summary:
      'Multi-market keyword discovery, search intent classification, clustering, and CSV export preserving country, language, engine, and methodology.',
    requiredProviders: 'DataForSEO Keywords API · Google Search Console',
  },
  ranks: {
    title: 'Rank Tracking',
    phase: 'Phase 2',
    summary:
      'Scheduled desktop/mobile position tracking, SERP feature observation, and competitor visibility trends.',
    requiredProviders: 'DataForSEO SERP API (Google) · Yandex Search API (RU)',
  },
  competitors: {
    title: 'Competitor Intelligence',
    phase: 'Phase 2',
    summary:
      'Keyword overlap, gap analysis, and SERP rival tracking using your persisted project competitor domains.',
    requiredProviders: 'DataForSEO Domain Intersection · Manual Competitors',
  },
  audit: {
    title: 'Technical SEO Audit',
    phase: 'Phase 2',
    summary:
      'Robots.txt-respecting crawler checking status codes, canonicals, broken links, meta tags, hreflang, and structured data.',
    requiredProviders: 'Server-Side Site Crawler Worker (Inngest / Trigger.dev)',
  },
  geo: {
    title: 'GEO — AI Search Visibility',
    phase: 'Phase 4',
    summary:
      'Track brand mentions and citation URLs across AI answers with explicit numerators, denominators, and observation timestamps.',
    requiredProviders: 'Observed Answer Snapshots + Provider Attribution',
  },
  aeo: {
    title: 'AEO — Answer Engine Optimization',
    phase: 'Phase 4',
    summary:
      'Question discovery, FAQ structuring, entity coverage, and schema recommendations grounded in search documentation.',
    requiredProviders: 'Search Console Queries + Gemini Content Analysis',
  },
  content: {
    title: 'Content Studio',
    phase: 'Phase 3 / 4',
    summary:
      'Bilingual Arabic/English content briefs, outlines, drafts, and version history with mandatory human review before publishing.',
    requiredProviders: 'Server-Side Gemini API + Brand Voice Profiles',
  },
  agents: {
    title: 'AI Marketing Agents',
    phase: 'Phase 3',
    summary:
      'Eight specialized AI analysts orchestrated server-side with structured JSON outputs, tool calls, and token metering.',
    requiredProviders: 'Gemini API (@google/genai) Server-Side Orchestrator',
  },
  reports: {
    title: 'Executive Reports',
    phase: 'Phase 6',
    summary:
      'Branded agency PDF/CSV executive summaries combining SEO health, rank movement, GEO visibility, and next actions.',
    requiredProviders: 'Reporting Pipeline + Org Usage Quotas',
  },
  integrations: {
    title: 'Integrations Hub',
    phase: 'Phase 5',
    summary:
      'Connect first-party Google Search Console, GA4, Bing Webmaster Tools, Yandex Webmaster, and DataForSEO.',
    requiredProviders: 'Encrypted Server-Side OAuth & API Credentials',
  },
};

export const ModulePreviews: React.FC<ModulePreviewsProps> = ({
  section,
  projects,
  demoMode,
  onToggleDemoMode,
}) => {
  const meta = MODULE_META[section] ?? MODULE_META.keywords;

  return (
    <div className="space-y-6">
      <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#F42902]">
              {meta.phase} Module · Honest Telemetry Policy
            </div>
            <h2 className="font-display text-2xl font-extrabold mt-1">{meta.title}</h2>
          </div>

          <button
            type="button"
            onClick={() => onToggleDemoMode(!demoMode)}
            className={`px-4 py-2 rounded-lg border border-[#111111] text-xs font-bold cursor-pointer ${
              demoMode ? 'bg-[#83FD80] text-[#111111]' : 'bg-[#111111] text-[#FDFDFF]'
            }`}
          >
            {demoMode ? 'Viewing Demo Sample Data (Switch to Live)' : 'Preview Sample Layout'}
          </button>
        </div>

        <p className="text-sm text-[#52525B] max-w-3xl">{meta.summary}</p>
        <div className="text-xs font-mono text-[#111111]">
          Required Providers: <span className="text-[#F42902]">{meta.requiredProviders}</span>
        </div>
      </div>

      {!demoMode ? (
        <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-8 space-y-4">
          <h3 className="font-display text-lg font-extrabold">
            Live Workspace Readiness ({projects.length} persisted project{projects.length === 1 ? '' : 's'})
          </h3>
          <p className="text-sm text-[#52525B]">
            No external provider credentials are connected in Phase 1. Consistent with EL MATBA5
            integrity rules, we do not invent keyword search volumes, rankings, or crawl counts.
          </p>
          {projects.length > 0 && (
            <div className="text-xs font-mono text-[#111111] border-t border-[#111111]/10 pt-4">
              Active targets ready for {meta.title}:{' '}
              {projects
                .flatMap((p) =>
                  p.marketTargets.map((m) => `${p.name} (${m.countryCode}/${m.searchEngineCode})`)
                )
                .join(' · ')}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#FDFDFF] border-2 border-[#111111] rounded-xl p-6 space-y-4">
          <div className="text-xs font-extrabold uppercase tracking-wider text-[#F42902]">
            {DEMO_DATASET.label}
          </div>

          {(section === 'keywords' || section === 'ranks' || section === 'competitors') && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#111111]/20">
                  <tr>
                    <th className="py-2.5 pr-4 font-bold">Keyword</th>
                    <th className="py-2.5 pr-4 font-bold">Market</th>
                    <th className="py-2.5 pr-4 font-bold">Intent</th>
                    <th className="py-2.5 pr-4 font-bold">Pos</th>
                    <th className="py-2.5 pr-4 font-bold">Volume</th>
                    <th className="py-2.5 font-bold">Methodology</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#111111]/10">
                  {DEMO_DATASET.sampleKeywords.map((kw) => (
                    <tr key={kw.keyword}>
                      <td className="py-2.5 pr-4 font-semibold">{kw.keyword}</td>
                      <td className="py-2.5 pr-4 font-mono">{kw.market}</td>
                      <td className="py-2.5 pr-4">{kw.intent}</td>
                      <td className="py-2.5 pr-4 font-mono font-bold tabular-nums">
                        #{kw.position} ({kw.change})
                      </td>
                      <td className="py-2.5 pr-4 font-mono tabular-nums">{kw.volume}</td>
                      <td className="py-2.5 text-[#52525B]">{kw.methodology}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {section === 'audit' && (
            <div className="divide-y divide-[#111111]/10 text-sm">
              {DEMO_DATASET.sampleAuditIssues.map((iss) => (
                <div key={iss.title} className="py-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-bold">
                      <span className="text-[#F42902] mr-2">[{iss.severity}]</span>
                      {iss.title}
                    </div>
                    <p className="text-xs text-[#52525B] mt-1">{iss.recommendation}</p>
                  </div>
                  <span className="font-mono text-xs shrink-0 tabular-nums">
                    {iss.affectedUrls} URLs
                  </span>
                </div>
              ))}
            </div>
          )}

          {(section === 'geo' || section === 'aeo' || section === 'content' || section === 'agents' || section === 'reports' || section === 'integrations') && (
            <div className="divide-y divide-[#111111]/10 text-sm">
              {DEMO_DATASET.sampleGeoPrompts.map((gp) => (
                <div key={gp.prompt} className="py-3 space-y-1">
                  <div className="font-bold">{gp.prompt}</div>
                  <div className="text-xs font-mono text-[#52525B]">
                    {gp.market} · Brand Mentioned: {gp.brandMentioned ? 'Yes' : 'No'} · Citation:{' '}
                    {gp.citationUrl} · {gp.methodology}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
