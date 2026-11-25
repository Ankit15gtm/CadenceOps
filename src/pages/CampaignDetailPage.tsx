import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, Pin, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';
import { formatCodeLabel, formatCurrency } from '../lib/utils.ts';
import { getRemarkCategoryLabel, getRemarkCategoryStyle, getSentimentStyle, REMARK_CATEGORIES } from '../lib/remarks.ts';

type CampaignTab =
  | 'overview'
  | 'companies'
  | 'contacts'
  | 'remarks'
  | 'distribution'
  | 'team'
  | 'activities'
  | 'followups'
  | 'appointments'
  | 'reports'
  | 'instructions';

const TABS: Array<{ id: CampaignTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'companies', label: 'Companies' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'remarks', label: 'Prospect Remarks' },
  { id: 'distribution', label: 'Data Distribution' },
  { id: 'team', label: 'Sales Team' },
  { id: 'activities', label: 'Activities' },
  { id: 'followups', label: 'Follow-ups' },
  { id: 'appointments', label: 'Appointments' },
  { id: 'reports', label: 'Reports' },
  { id: 'instructions', label: 'Campaign Instructions' },
];

export function CampaignDetailPage({
  campaignId,
  onBack,
  onOpenRecord,
}: {
  campaignId: number;
  onBack: () => void;
  onOpenRecord: (recordId: number) => void;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<CampaignTab>('overview');
  const [loading, setLoading] = useState(true);
  const [instructionsDraft, setInstructionsDraft] = useState('');
  const [criteriaDraft, setCriteriaDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState('ACTIVE');
  const [remarkSearch, setRemarkSearch] = useState('');
  const [remarkCatFilter, setRemarkCatFilter] = useState('');

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER' || user?.role === 'CAMPAIGN_MANAGER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/campaigns/${campaignId}`);
      setData(res);
      setInstructionsDraft(res.campaign.instructions || '');
      setCriteriaDraft(res.campaign.qualificationCriteria || '');
      setStatusDraft(res.campaign.status || 'ACTIVE');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSettings = async () => {
    try {
      await apiFetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: statusDraft,
          instructions: instructionsDraft,
          qualificationCriteria: criteriaDraft,
        }),
      });
      toast.success('Campaign updated');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update campaign');
    }
  };

  const cloneCampaign = async () => {
    try {
      const res = await apiFetch<{ campaign: { name: string; campaignCode: string } }>(`/api/campaigns/${campaignId}/clone`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast.success(`Cloned as "${res.campaign.name}" (${res.campaign.campaignCode}) in Draft.`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to clone campaign');
    }
  };

  if (loading || !data) {
    return <div className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  const c = data.campaign;
  const allocated = data.companies.filter((r: any) => r.assignedToId !== null).length;
  const worked = data.companies.filter((r: any) => r.status !== 'NOT_YET_WORKED').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            <span>Campaigns</span>
          </Button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">{c.name}</h1>
              <StatusLabel status={c.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {c.campaignCode} · {c.clientName || 'Internal Campaign'} · {c.targetCountries || 'Global'}
            </div>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={cloneCampaign}>
              <Copy className="h-3.5 w-3.5" />
              <span>Clone Campaign</span>
            </Button>
            <SelectField className="w-36" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)}>
              <option value="DRAFT">Draft</option>
              <option value="READY">Ready</option>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
            </SelectField>
            <Button size="sm" onClick={saveSettings}>
              <Save className="h-3.5 w-3.5" />
              <span>Save Status</span>
            </Button>
          </div>
        )}
      </div>

      {/* 10-Tab Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-medium rounded-t-md whitespace-nowrap shrink-0 cursor-pointer border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {[
              { label: 'Target Companies', value: c.targetCompaniesCount },
              { label: 'Imported Records', value: data.companies.length },
              { label: 'Data Allocated', value: allocated },
              { label: 'Worked On', value: worked },
              { label: 'Appointments', value: data.appointments.length },
              { label: 'Pipeline + Won', value: formatCurrency((data.dealsSummary?.openValue || 0) + (data.dealsSummary?.wonValue || 0)) },
            ].map((m) => (
              <Card key={m.label}>
                <CardContent className="p-4">
                  <div className="text-xs text-slate-500">{m.label}</div>
                  <div className="font-mono text-xl font-semibold tabular-nums mt-1">{m.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {Array.isArray(data.funnel) && data.funnel.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Stage-by-Stage Conversion Funnel</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {data.funnel.map((step: { stage: string; count: number }, idx: number) => {
                  const base = Math.max(1, data.funnel[0]?.count || 1);
                  const pct = Math.round((step.count / base) * 100);
                  const prev = idx > 0 ? data.funnel[idx - 1].count : step.count;
                  const stepConv = idx > 0 && prev > 0 ? Math.round((step.count / prev) * 100) : 100;
                  return (
                    <div key={step.stage} className="grid grid-cols-12 items-center gap-3 text-xs">
                      <div className="col-span-4 sm:col-span-3 font-medium text-slate-700 dark:text-slate-200">{step.stage}</div>
                      <div className="col-span-5 sm:col-span-7 h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
                          style={{ width: `${Math.max(step.count > 0 ? 4 : 0, Math.min(100, pct))}%` }}
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2 text-right font-mono tabular-nums">
                        <span className="font-semibold">{step.count}</span>
                        {idx > 0 && <span className="text-slate-400 ml-1.5">({stepConv}%)</span>}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Campaign Specifications</CardTitle></CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <div><span className="text-slate-500">Objective:</span> {c.objective || '—'}</div>
                <div><span className="text-slate-500">Description:</span> {c.description || '—'}</div>
                <div><span className="text-slate-500">Target Industries:</span> {c.targetIndustry || '—'}</div>
                <div><span className="text-slate-500">Target Job Titles:</span> {c.targetJobTitles || '—'}</div>
                <div><span className="text-slate-500">Company Size:</span> {c.targetCompanySize || '—'}</div>
                <div><span className="text-slate-500">Timeline:</span> {c.startDate || '—'} to {c.endDate || 'Ongoing'}</div>
                <div><span className="text-slate-500">Campaign Manager:</span> {c.campaignManagerName || '—'}</div>
                <div><span className="text-slate-500">Data Manager:</span> {c.dataManagerName || '—'}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Playbook &amp; Qualification Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Lead Qualification Criteria</div>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line">{c.qualificationCriteria || 'None defined.'}</p>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-1">Qualification Questions</div>
                  {Array.isArray(c.qualificationQuestions) && c.qualificationQuestions.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1 text-slate-700 dark:text-slate-300">
                      {c.qualificationQuestions.map((q: string, idx: number) => <li key={idx}>{q}</li>)}
                    </ul>
                  ) : (
                    <p className="text-slate-500">No qualification questions configured.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === 'companies' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Company</th>
                  <th className="py-3 px-4 font-medium">Industry / Country</th>
                  <th className="py-3 px-4 font-medium">Assigned Rep</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Prospect Brief &amp; Latest Remark</th>
                  <th className="py-3 px-4 font-medium text-right">Fit Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.companies.map((r: any) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => onOpenRecord(r.id)}
                  >
                    <td className="py-3 px-4 font-medium">{r.companyName} <span className="text-xs text-slate-400 ml-1">{r.domain}</span></td>
                    <td className="py-3 px-4 text-xs text-slate-500">{r.industry || '—'} · {r.country || '—'}</td>
                    <td className="py-3 px-4 text-xs">{r.assignedToName || 'Unassigned'}</td>
                    <td className="py-3 px-4"><StatusLabel status={r.status} /></td>
                    <td className="py-3 px-4 max-w-sm">
                      <div className="flex flex-wrap items-center gap-1 mb-0.5">
                        {r.prospectSentiment && (
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getSentimentStyle(r.prospectSentiment)}`}>
                            {r.prospectSentiment}
                          </span>
                        )}
                        {r.remarksCount > 0 && (
                          <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                            {r.remarksCount} remark{r.remarksCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {r.latestRemark?.content || r.prospectSummary || <span className="text-slate-400">No remarks yet</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{r.fitScore}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'remarks' && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  className="pl-9"
                  placeholder="Search remarks by company, rep, or note text..."
                  value={remarkSearch}
                  onChange={(e) => setRemarkSearch(e.target.value)}
                />
              </div>
              <SelectField className="sm:w-56" value={remarkCatFilter} onChange={(e) => setRemarkCatFilter(e.target.value)}>
                <option value="">All Remark Categories</option>
                {REMARK_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </SelectField>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
              {(data.remarks || [])
                .filter((rm: any) => {
                  if (remarkCatFilter && rm.category !== remarkCatFilter) return false;
                  if (remarkSearch) {
                    const hay = `${rm.companyName} ${rm.contactName || ''} ${rm.authorName} ${rm.content}`.toLowerCase();
                    if (!hay.includes(remarkSearch.trim().toLowerCase())) return false;
                  }
                  return true;
                })
                .map((rm: any) => (
                  <div
                    key={rm.id}
                    className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer space-y-1.5"
                    onClick={() => onOpenRecord(rm.campaignCompanyRecordId)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">{rm.companyName}</span>
                        {rm.isPinned && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-100 text-amber-900 text-[10px] font-semibold">
                            <Pin className="h-2.5 w-2.5" /> PINNED
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getRemarkCategoryStyle(rm.category)}`}>
                          {getRemarkCategoryLabel(rm.category)}
                        </span>
                        {rm.contactName && <span className="text-slate-500">· Contact: {rm.contactName}</span>}
                      </div>
                      <span className="font-mono text-xs text-slate-500 tabular-nums">
                        {rm.authorName} · {new Date(rm.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{rm.content}</p>
                  </div>
                ))}
              {(data.remarks || []).length === 0 && (
                <div className="p-8 text-center text-sm text-slate-500">
                  No sales rep remarks logged in this campaign yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'contacts' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Contact</th>
                  <th className="py-3 px-4 font-medium">Company</th>
                  <th className="py-3 px-4 font-medium">Job Title</th>
                  <th className="py-3 px-4 font-medium">Email / Phone</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.contacts.map((ct: any) => (
                  <tr key={ct.id}>
                    <td className="py-3 px-4 font-medium">{ct.fullName}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{ct.companyName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{ct.jobTitle || '—'}</td>
                    <td className="py-3 px-4 text-xs font-mono">{ct.workEmail || ct.phone || '—'}</td>
                    <td className="py-3 px-4"><StatusLabel status={ct.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'distribution' && (
        <Card>
          <CardHeader><CardTitle>Distribution Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>Total Companies in Campaign: <span className="font-mono font-semibold tabular-nums">{data.companies.length}</span></div>
            <div>Allocated to Sales Reps: <span className="font-mono font-semibold tabular-nums">{allocated}</span></div>
            <div>Unallocated Pool: <span className="font-mono font-semibold tabular-nums">{data.companies.length - allocated}</span></div>
          </CardContent>
        </Card>
      )}

      {tab === 'team' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Representative</th>
                  <th className="py-3 px-4 font-medium">Role</th>
                  <th className="py-3 px-4 font-medium text-right">Assigned</th>
                  <th className="py-3 px-4 font-medium text-right">Worked</th>
                  <th className="py-3 px-4 font-medium text-right">Appointments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.salesTeam.map((m: any) => (
                  <tr key={m.id}>
                    <td className="py-3 px-4 font-medium">{m.fullName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{m.jobRole}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{m.assignedCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{m.workedCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{m.appointmentsCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'activities' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Date &amp; Time</th>
                  <th className="py-3 px-4 font-medium">Company / Contact</th>
                  <th className="py-3 px-4 font-medium">Channel</th>
                  <th className="py-3 px-4 font-medium">Rep</th>
                  <th className="py-3 px-4 font-medium">Outcome</th>
                  <th className="py-3 px-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.activities.map((a: any) => (
                  <tr key={a.id}>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{a.activityDate} {a.activityTime}</td>
                    <td className="py-3 px-4">{a.companyName} <span className="text-xs text-slate-500">· {a.contactName || '—'}</span></td>
                    <td className="py-3 px-4 text-xs">{formatCodeLabel(a.channel)}</td>
                    <td className="py-3 px-4 text-xs">{a.repName}</td>
                    <td className="py-3 px-4"><StatusLabel status={a.resultingStatus} /></td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">{a.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'followups' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Due</th>
                  <th className="py-3 px-4 font-medium">Company</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Rep</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.followUps.map((f: any) => (
                  <tr key={f.id}>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{f.followUpDate} {f.followUpTime}</td>
                    <td className="py-3 px-4">{f.companyName}</td>
                    <td className="py-3 px-4 text-xs">{formatCodeLabel(f.followUpType)}</td>
                    <td className="py-3 px-4 text-xs">{f.repName}</td>
                    <td className="py-3 px-4"><StatusLabel status={f.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'appointments' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Date &amp; Time</th>
                  <th className="py-3 px-4 font-medium">Company &amp; Prospect</th>
                  <th className="py-3 px-4 font-medium">Rep</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.appointments.map((ap: any) => (
                  <tr key={ap.id}>
                    <td className="py-3 px-4 font-mono text-xs tabular-nums">{ap.appointmentDate} {ap.appointmentTime}</td>
                    <td className="py-3 px-4">{ap.companyName} · <span className="font-medium">{ap.prospectName}</span></td>
                    <td className="py-3 px-4 text-xs">{ap.repName}</td>
                    <td className="py-3 px-4 text-xs">{ap.meetingType}</td>
                    <td className="py-3 px-4"><StatusLabel status={ap.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'reports' && (
        <Card>
          <CardHeader><CardTitle>Campaign Conversion Snapshot</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500">Outreach Touchpoints</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-1">{data.activities.length}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Completion Rate</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-1">
                {allocated > 0 ? Math.round((worked / allocated) * 100) : 0}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Appointment Conversion</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-1">
                {worked > 0 ? Math.round((data.appointments.length / worked) * 100) : 0}%
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Pending Follow-ups</div>
              <div className="font-mono text-xl font-semibold tabular-nums mt-1">
                {data.followUps.filter((f: any) => f.status === 'PENDING' || f.status === 'OVERDUE').length}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'instructions' && (
        <Card>
          <CardHeader><CardTitle>Campaign Instructions &amp; Qualification Criteria</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Outreach Playbook Instructions</Label>
              <Textarea
                rows={5}
                value={instructionsDraft}
                onChange={(e) => setInstructionsDraft(e.target.value)}
                disabled={!canManage}
              />
            </div>
            <div>
              <Label>Qualification Criteria</Label>
              <Textarea
                rows={3}
                value={criteriaDraft}
                onChange={(e) => setCriteriaDraft(e.target.value)}
                disabled={!canManage}
              />
            </div>
            {canManage && (
              <div className="flex justify-end">
                <Button onClick={saveSettings}>Save Instructions</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
