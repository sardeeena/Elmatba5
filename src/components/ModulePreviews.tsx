import React from 'react';
import type { Project } from '../lib/types';

interface ModulePreviewsProps {
  section: string;
  projects: Project[];
}

const MODULE_META: Record<
  string,
  { title: string; phase: string; summary: string; requiredProviders: string }
> = {
  keywords: {
    title: 'Keyword Research',
    phase: 'Phase 2B (Coming Soon)',
    summary:
      'Multi-market keyword discovery, search intent classification, clustering, and CSV export preserving country, language, engine, and methodology.',
    requiredProviders: 'DataForSEO Keywords API · Google Search Console',
  },
  ranks: {
    title: 'Rank Tracking',
    phase: 'Phase 2B (Coming Soon)',
    summary:
      'Scheduled desktop/mobile position tracking, SERP feature observation, and competitor visibility trends.',
    requiredProviders: 'DataForSEO SERP API (Google) · Yandex Search API (RU)',
  },
  competitors: {
    title: 'Competitor Intelligence',
    phase: 'Phase 2B (Coming Soon)',
    summary:
      'Keyword overlap, gap analysis, and SERP rival tracking using your persisted project competitor domains.',
    requiredProviders: 'DataForSEO Domain Intersection · Manual Competitors',
  },
  audit: {
    title: 'Technical SEO Audit',
    phase: 'Phase 2B (Coming Soon)',
    summary:
      'Robots.txt-respecting crawler checking status codes, canonicals, broken links, meta tags, hreflang, and structured data.',
    requiredProviders: 'Server-Side Site Crawler Worker',
  },
  geo: {
    title: 'GEO — AI Search Visibility',
    phase: 'Phase 4 (Coming Soon)',
    summary:
      'Track brand mentions and citation URLs across AI answers with explicit numerators, denominators, and observation timestamps.',
    requiredProviders: 'Observed Answer Snapshots + Provider Attribution',
  },
  aeo: {
    title: 'AEO — Answer Engine Optimization',
    phase: 'Phase 4 (Coming Soon)',
    summary:
      'Question discovery, FAQ structuring, entity coverage, and schema recommendations grounded in search documentation.',
    requiredProviders: 'Search Console Queries + Gemini Content Analysis',
  },
  content: {
    title: 'Content Studio',
    phase: 'Phase 3 / 4 (Coming Soon)',
    summary:
      'Bilingual Arabic/English content briefs, outlines, drafts, and version history with mandatory human review before publishing.',
    requiredProviders: 'Server-Side Gemini API + Brand Voice Profiles',
  },
  agents: {
    title: 'AI Marketing Agents',
    phase: 'Phase 3 (Coming Soon)',
    summary:
      'Eight specialized AI analysts orchestrated server-side with structured JSON outputs, tool calls, and token metering.',
    requiredProviders: 'Gemini API (@google/genai) Server-Side Orchestrator',
  },
  reports: {
    title: 'Executive Reports',
    phase: 'Phase 6 (Coming Soon)',
    summary:
      'Branded agency PDF/CSV executive summaries combining SEO health, rank movement, GEO visibility, and next actions.',
    requiredProviders: 'Reporting Pipeline + Org Usage Quotas',
  },
  integrations: {
    title: 'Integrations Hub',
    phase: 'Phase 5 (Coming Soon)',
    summary:
      'Connect first-party Google Search Console, GA4, Bing Webmaster Tools, Yandex Webmaster, and DataForSEO.',
    requiredProviders: 'Encrypted Server-Side OAuth & API Credentials',
  },
};

export const ModulePreviews: React.FC<ModulePreviewsProps> = ({ section, projects }) => {
  const meta = MODULE_META[section] ?? MODULE_META.keywords;

  return (
    <div className="space-y-6">
      <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-[#F42902]">
              {meta.phase} · Preview / Unavailable
            </div>
            <h2 className="font-display text-2xl font-extrabold mt-1">{meta.title}</h2>
          </div>

          <span className="px-3 py-1.5 rounded-md border border-[#111111] bg-[#111111] text-[#FDFDFF] text-xs font-bold">
            Provider Connection Required
          </span>
        </div>

        <p className="text-sm text-[#52525B] max-w-3xl">{meta.summary}</p>
        <div className="text-xs font-mono text-[#111111]">
          Required Providers: <span className="text-[#F42902]">{meta.requiredProviders}</span>
        </div>
      </div>

      <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-8 space-y-4">
        <h3 className="font-display text-lg font-extrabold">
          Live Workspace Readiness ({projects.length} persisted project
          {projects.length === 1 ? '' : 's'})
        </h3>
        <p className="text-sm text-[#52525B]">
          This module is labeled honestly as preview/unavailable in Phase 2A until external provider
          credentials and workers are connected. No fabricated keyword search volumes, rankings, or
          crawl counts are generated.
        </p>

        {projects.length > 0 && (
          <div className="border-t border-[#111111]/10 pt-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[#52525B]">
              Configured Targets Ready for {meta.title}
            </div>
            <div className="divide-y divide-[#111111]/10 text-xs">
              {projects.map((p) => (
                <div key={p.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold">{p.name}</span>
                    <span className="mx-2 text-[#52525B]">·</span>
                    <span className="font-mono text-[#52525B]">{p.websiteUrl}</span>
                  </div>
                  <div className="font-mono text-[#F42902]">
                    {p.marketTargets
                      .map((m) => `${m.countryCode}/${m.searchEngineCode} (${m.assignedProvider})`)
                      .join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
