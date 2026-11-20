import React, { useState } from 'react';
import { Check, Copy, Download, Plus, Shield } from 'lucide-react';
import { api } from '../lib/api';
import type {
  AuditLogItem,
  BusinessType,
  OrganizationInvitationItem,
  OrganizationMemberItem,
  OrganizationSummary,
  PlanDefinition,
  ProviderCoverageEntry,
  UsageSummary,
} from '../lib/types';

interface OrgAndBillingProps {
  section: 'markets' | 'team' | 'billing' | 'settings';
  organization: OrganizationSummary;
  plan: PlanDefinition | null;
  allPlans: PlanDefinition[];
  usage: UsageSummary;
  members: OrganizationMemberItem[];
  invitations: OrganizationInvitationItem[];
  auditLogs: AuditLogItem[];
  coverage: ProviderCoverageEntry[];
  onRefresh: () => Promise<void>;
  onCreatedOrg: (org: OrganizationSummary) => void;
}

export const OrgAndBillingViews: React.FC<OrgAndBillingProps> = ({
  section,
  organization,
  plan,
  allPlans,
  usage,
  members,
  invitations,
  auditLogs,
  coverage,
  onRefresh,
  onCreatedOrg,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'analyst' | 'viewer'>('analyst');
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [acceptToken, setAcceptToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Create new org state
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgType, setNewOrgType] = useState<BusinessType>('agency');

  const canManageAdmin = organization.role === 'owner' || organization.role === 'admin';

  if (section === 'markets') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Global Market & Provider Registry</h2>
          <p className="text-sm text-[#52525B]">
            Every market routes strictly to its authorized data provider. EL MATBA5 never silently
            substitutes countries or search engines.
          </p>
        </div>

        <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111111] text-[#FDFDFF]">
              <tr>
                <th className="py-3 px-4 font-bold">Country</th>
                <th className="py-3 px-4 font-bold">Engine</th>
                <th className="py-3 px-4 font-bold">Provider</th>
                <th className="py-3 px-4 font-bold">SERP</th>
                <th className="py-3 px-4 font-bold">Volume</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#111111]/10">
              {coverage.map((c, idx) => (
                <tr key={`${c.providerCode}-${c.countryCode}-${c.searchEngineCode}-${idx}`}>
                  <td className="py-3 px-4 font-mono font-bold">{c.countryCode}</td>
                  <td className="py-3 px-4 uppercase">{c.searchEngineCode}</td>
                  <td className="py-3 px-4 font-mono">{c.providerCode}</td>
                  <td className="py-3 px-4">{c.supportsSerp ? 'Yes' : 'No'}</td>
                  <td className="py-3 px-4">{c.supportsKeywordVolume ? 'Yes' : 'No'}</td>
                  <td className="py-3 px-4 font-bold text-[#F42902]">
                    {c.coverageStatus.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 px-4 text-[#52525B] max-w-md">{c.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === 'team') {
    const handleInvite = async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setMsg(null);
      setCreatedInviteLink(null);
      try {
        const res = await api.inviteMember(organization.id, {
          email: inviteEmail,
          role: inviteRole,
        });
        setInviteEmail('');
        const link = `${window.location.origin}/?invite=${encodeURIComponent(res.inviteToken)}`;
        setCreatedInviteLink(link);
        setMsg(
          'Invitation created with single-use hashed token. Share the secure link below with your teammate.'
        );
        await onRefresh();
      } catch (error) {
        setErr((error as Error).message);
      }
    };

    const handleAcceptToken = async (e: React.FormEvent) => {
      e.preventDefault();
      setErr(null);
      setMsg(null);
      try {
        const cleaned = acceptToken.includes('invite=')
          ? new URL(acceptToken).searchParams.get('invite') ?? acceptToken
          : acceptToken;
        const res = await api.acceptInvitation(cleaned.trim());
        setAcceptToken('');
        onCreatedOrg(res.organization);
        setMsg(`Joined ${res.organization.name} as ${res.organization.role}.`);
      } catch (error) {
        setErr((error as Error).message);
      }
    };

    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Team & Access Control</h2>
          <p className="text-sm text-[#52525B]">
            Manage members and RLS-enforced permissions inside {organization.name}.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
            <h3 className="font-display text-lg font-extrabold">
              Active Members ({members.length} / {plan?.maxTeamMembers ?? '—'})
            </h3>
            <div className="divide-y divide-[#111111]/10 text-sm">
              {members.map((m) => (
                <div key={m.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold">{m.fullName}</div>
                    <div className="text-xs font-mono text-[#52525B]">{m.email}</div>
                  </div>
                  <span className="text-xs font-bold uppercase text-[#F42902]">{m.role}</span>
                </div>
              ))}
            </div>

            {invitations.length > 0 && (
              <div className="pt-4 border-t border-[#111111]/10 space-y-2">
                <h4 className="text-xs font-bold uppercase text-[#52525B]">Invitations</h4>
                {invitations.map((inv) => (
                  <div key={inv.id} className="text-xs flex justify-between py-1">
                    <span className="font-mono">{inv.email}</span>
                    <span>
                      {inv.role} · {inv.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-5">
            <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
              <h3 className="font-display text-lg font-extrabold">Invite Teammate</h3>
              {!canManageAdmin ? (
                <p className="text-xs text-[#52525B]">
                  Only organization owners or admins can issue new team invitations.
                </p>
              ) : (
                <form onSubmit={handleInvite} className="space-y-3">
                  <div>
                    <label htmlFor="inv-email" className="block text-xs font-semibold mb-1">
                      Teammate Email
                    </label>
                    <input
                      id="inv-email"
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="seo@agency.eg"
                      className="w-full px-3 py-2 rounded-lg border border-[#111111]/25 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="inv-role" className="block text-xs font-semibold mb-1">
                      Role
                    </label>
                    <select
                      id="inv-role"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'admin' | 'analyst' | 'viewer')}
                      className="w-full px-3 py-2 rounded-lg border border-[#111111]/25 text-sm bg-[#FDFDFF]"
                    >
                      <option value="admin">Admin</option>
                      <option value="analyst">Analyst</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  {err && <div className="text-xs text-[#F42902] font-semibold">{err}</div>}
                  {msg && (
                    <div className="text-xs text-[#111111] font-semibold bg-[#83FD80]/40 p-2.5 rounded space-y-2">
                      <div>{msg}</div>
                      {createdInviteLink && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            readOnly
                            value={createdInviteLink}
                            className="flex-1 px-2 py-1 rounded border border-[#111111]/25 bg-[#FDFDFF] font-mono text-[11px]"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(createdInviteLink);
                              setCopiedInvite(true);
                              setTimeout(() => setCopiedInvite(false), 2000);
                            }}
                            className="px-2.5 py-1 rounded bg-[#111111] text-[#FDFDFF] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            {copiedInvite ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedInvite ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] text-xs font-bold cursor-pointer"
                  >
                    Create Secure Invitation
                  </button>
                </form>
              )}
            </div>

            <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-3">
              <h3 className="font-display text-base font-extrabold">Accept Workspace Invitation</h3>
              <form onSubmit={handleAcceptToken} className="space-y-2.5">
                <input
                  type="text"
                  required
                  value={acceptToken}
                  onChange={(e) => setAcceptToken(e.target.value)}
                  placeholder="Paste invite link or token"
                  className="w-full px-3 py-2 rounded-lg border border-[#111111]/25 text-xs font-mono"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#111111] text-[#FDFDFF] text-xs font-bold hover:bg-[#F42902] cursor-pointer"
                >
                  Accept Invitation
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (section === 'billing') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-display text-2xl font-extrabold">Subscription & Usage Metering</h2>
          <p className="text-sm text-[#52525B]">
            Period <span className="font-mono">{usage.periodYm}</span> · Current Plan:{' '}
            <strong>{plan?.name ?? organization.planId}</strong>
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Projects', val: `${usage.projectsCount} / ${plan?.maxProjects ?? 0}` },
            { label: 'Keywords', val: `${usage.keywordsTracked} / ${plan?.maxKeywords ?? 0}` },
            { label: 'Crawls', val: `${usage.crawlsRun} / ${plan?.maxCrawlsMonthly ?? 0}` },
            { label: 'AI Credits', val: `${usage.aiCreditsUsed} / ${plan?.maxAiCreditsMonthly ?? 0}` },
          ].map((u) => (
            <div key={u.label} className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-5">
              <div className="text-xs font-semibold text-[#52525B]">{u.label}</div>
              <div className="mt-1 font-display text-xl font-extrabold tabular-nums">{u.val}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {allPlans.map((p) => {
            const isCurrent = p.id === organization.planId;
            return (
              <div
                key={p.id}
                className={`rounded-xl border-2 p-6 space-y-3 ${
                  isCurrent
                    ? 'border-[#111111] bg-[#83FD80]/20'
                    : 'border-[#111111]/20 bg-[#FDFDFF]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-extrabold">{p.name}</span>
                  {isCurrent && <span className="text-xs font-bold text-[#F42902]">Current</span>}
                </div>
                <div className="font-mono text-2xl font-bold tabular-nums">
                  {p.priceEgpMonthly.toLocaleString()} EGP{' '}
                  <span className="text-xs font-normal text-[#52525B]">
                    (${p.priceUsdMonthly}/mo)
                  </span>
                </div>
                <p className="text-xs text-[#52525B]">{p.description}</p>
              </div>
            );
          })}
        </div>

        <div className="p-4 rounded-xl border border-[#111111]/20 bg-[#FDFDFF] text-xs text-[#52525B]">
          Paymob Egypt payment checkout and server-side HMAC webhook verification activate in Phase 6.
          Subscriptions are never upgraded via frontend redirects alone.
        </div>
      </div>
    );
  }

  // SETTINGS & GDPR
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Shield className="w-5 h-5 text-[#F42902]" />
            <span>GDPR Data Export & Organization</span>
          </div>
          <p className="text-xs text-[#52525B]">
            Export a complete JSON archive of {organization.name}, including projects, market
            targets, competitors, members, and audit logs (Owner/Admin only).
          </p>
          {err && <div className="text-xs text-[#F42902] font-semibold">{err}</div>}
          <button
            type="button"
            disabled={exporting || !canManageAdmin}
            onClick={async () => {
              setErr(null);
              setExporting(true);
              try {
                await api.downloadGdprExport(organization.id);
              } catch (error) {
                setErr((error as Error).message);
              } finally {
                setExporting(false);
              }
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#111111] text-[#FDFDFF] text-xs font-bold hover:bg-[#F42902] cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{exporting ? 'Preparing Archive...' : 'Download Organization JSON Archive'}</span>
          </button>
        </div>

        <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-extrabold">Create Additional Organization</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              try {
                const res = await api.createOrganization({
                  name: newOrgName,
                  businessType: newOrgType,
                  billingCountryCode: 'EG',
                });
                setNewOrgName('');
                onCreatedOrg(res.organization);
              } catch (error) {
                setErr((error as Error).message);
              }
            }}
            className="space-y-3"
          >
            <input
              type="text"
              required
              minLength={2}
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              placeholder="New Agency or Client Org"
              className="w-full px-3 py-2 rounded-lg border border-[#111111]/25 text-sm"
            />
            <select
              value={newOrgType}
              onChange={(e) => setNewOrgType(e.target.value as BusinessType)}
              className="w-full px-3 py-2 rounded-lg border border-[#111111]/25 text-sm bg-[#FDFDFF]"
            >
              <option value="agency">Agency</option>
              <option value="consultant">Consultant</option>
              <option value="business">Business</option>
              <option value="ecommerce">E-Commerce</option>
            </select>
            {err && <div className="text-xs text-[#F42902]">{err}</div>}
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-[#83FD80] text-[#111111] border border-[#111111] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Organization</span>
            </button>
          </form>
        </div>
      </div>

      <div className="bg-[#FDFDFF] border border-[#111111]/20 rounded-xl p-6 space-y-4">
        <h3 className="font-display text-lg font-extrabold">Organization Audit Log</h3>
        <div className="divide-y divide-[#111111]/10 text-xs">
          {auditLogs.map((log) => (
            <div key={log.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-mono font-bold text-[#F42902]">{log.action}</span>
                <span className="mx-2 text-[#52525B]">·</span>
                <span>{log.actorEmail ?? 'System'}</span>
              </div>
              <span className="font-mono text-[#52525B] tabular-nums">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
