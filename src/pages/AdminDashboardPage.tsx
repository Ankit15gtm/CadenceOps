import React, { useCallback, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { formatCurrency } from '../lib/utils.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';

interface AdminDashboardData {
  summary: {
    totalCompaniesImported: number;
    totalContactsImported: number;
    totalUniqueCompanies: number;
    totalCampaigns: number;
    activeCampaigns: number;
    completedCampaigns: number;
    totalDataDistributed: number;
    dataYetToBeDistributed: number;
    totalDataAssigned: number;
    dataWorkedOn: number;
    dataNotYetWorked: number;
    totalCalls: number;
    totalLinkedInOutreach: number;
    totalEmailsSent: number;
    totalWhatsAppOutreach: number;
    totalFollowUpsPending: number;
    totalAppointmentsBooked: number;
    totalInterestedProspects: number;
    totalQualifiedLeads: number;
    totalUnqualifiedLeads: number;
  };
  funnel?: Array<{ stage: string; count: number }>;
  pipelineSummary?: {
    openDealsCount: number;
    openPipelineValue: number;
    weightedPipelineValue: number;
    closedWonValue: number;
    winRate: number;
  };
  charts: {
    importTrend: Array<{ date: string; companies: number; contacts: number; duplicates: number }>;
    distributionTrend: Array<{ date: string; distributed: number; worked: number }>;
    campaignStats: Array<{
      campaignId: number;
      name: string;
      status: string;
      totalRecords: number;
      assigned: number;
      unassigned: number;
      worked: number;
      remaining: number;
      interested: number;
      appointments: number;
    }>;
    repPerformance: Array<{
      repId: number;
      name: string;
      assigned: number;
      worked: number;
      calls: number;
      linkedin: number;
      emails: number;
      whatsapp: number;
      interested: number;
      appointments: number;
    }>;
    activityTrend: Array<{
      date: string;
      calls: number;
      linkedin: number;
      emails: number;
      whatsapp: number;
      appointments: number;
      interested: number;
    }>;
    followUpStatusBreakdown: Array<{ status: string; count: number }>;
  };
  filterOptions: {
    campaigns: Array<{ id: number; name: string }>;
    salesReps: Array<{ id: number; name: string }>;
    dataManagers: Array<{ id: number; name: string }>;
  };
}

const CHART_COLORS = ['#1d4ed8', '#0284c7', '#16a34a', '#d97706', '#dc2626'];

export function AdminDashboardPage() {
  const { statuses } = useAuth();
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [dataManagerId, setDataManagerId] = useState('');
  const [salesRepId, setSalesRepId] = useState('');
  const [status, setStatus] = useState('');
  const [channel, setChannel] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (campaignId) params.set('campaignId', campaignId);
      if (dataManagerId) params.set('dataManagerId', dataManagerId);
      if (salesRepId) params.set('salesRepId', salesRepId);
      if (status) params.set('status', status);
      if (channel) params.set('channel', channel);
      const res = await apiFetch<AdminDashboardData>(`/api/dashboard/admin?${params.toString()}`);
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, campaignId, dataManagerId, salesRepId, status, channel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setCampaignId('');
    setDataManagerId('');
    setSalesRepId('');
    setStatus('');
    setChannel('');
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="h-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <Button onClick={loadData} size="sm">Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const s = data.summary;
  const kpiCards = [
    { label: 'Total Companies Imported', value: s.totalCompaniesImported },
    { label: 'Total Contacts Imported', value: s.totalContactsImported },
    { label: 'Total Unique Companies', value: s.totalUniqueCompanies },
    { label: 'Total Campaigns', value: s.totalCampaigns },
    { label: 'Active Campaigns', value: s.activeCampaigns },
    { label: 'Completed Campaigns', value: s.completedCampaigns },
    { label: 'Total Data Distributed', value: s.totalDataDistributed },
    { label: 'Yet to Be Distributed', value: s.dataYetToBeDistributed },
    { label: 'Total Data Assigned', value: s.totalDataAssigned },
    { label: 'Data Worked On', value: s.dataWorkedOn },
    { label: 'Data Not Yet Worked', value: s.dataNotYetWorked },
    { label: 'Total Calls', value: s.totalCalls },
    { label: 'LinkedIn Outreach', value: s.totalLinkedInOutreach },
    { label: 'Total Emails Sent', value: s.totalEmailsSent },
    { label: 'WhatsApp Outreach', value: s.totalWhatsAppOutreach },
    { label: 'Follow-ups Pending', value: s.totalFollowUpsPending },
    { label: 'Appointments Booked', value: s.totalAppointmentsBooked, accent: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Interested Prospects', value: s.totalInterestedProspects, accent: 'text-blue-700 dark:text-blue-400' },
    { label: 'Qualified Leads', value: s.totalQualifiedLeads, accent: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Unqualified / Declined', value: s.totalUnqualifiedLeads },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Operations Control Dashboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Live company-wide prospecting volume, data distribution, outreach activity, and conversion metrics.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Reset Filters</span>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          <div>
            <Label>Start Date</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Label>End Date</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <Label>Campaign</Label>
            <SelectField value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">All Campaigns</option>
              {data.filterOptions.campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
          </div>
          <div>
            <Label>Data Manager</Label>
            <SelectField value={dataManagerId} onChange={(e) => setDataManagerId(e.target.value)}>
              <option value="">All Data Managers</option>
              {data.filterOptions.dataManagers.map((dm) => (
                <option key={dm.id} value={dm.id}>{dm.name}</option>
              ))}
            </SelectField>
          </div>
          <div>
            <Label>Sales Representative</Label>
            <SelectField value={salesRepId} onChange={(e) => setSalesRepId(e.target.value)}>
              <option value="">All Representatives</option>
              {data.filterOptions.salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>{rep.name}</option>
              ))}
            </SelectField>
          </div>
          <div>
            <Label>Lead Status</Label>
            <SelectField value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {statuses.map((st) => (
                <option key={st.code} value={st.code}>{st.label}</option>
              ))}
            </SelectField>
          </div>
          <div>
            <Label>Outreach Channel</Label>
            <SelectField value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">All Channels</option>
              <option value="PHONE_CALL">Phone Call</option>
              <option value="LINKEDIN_CONNECTION">LinkedIn Connection</option>
              <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
            </SelectField>
          </div>
        </CardContent>
      </Card>

      {/* 20 Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {kpiCards.map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{item.label}</div>
              <div className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${item.accent || 'text-slate-900 dark:text-white'}`}>
                {item.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conversion Funnel & Pipeline Revenue Strip */}
      {(data.funnel || data.pipelineSummary) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {data.funnel && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Prospect-to-Revenue Conversion Funnel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {data.funnel.map((step, idx) => {
                  const base = Math.max(1, data.funnel?.[0]?.count || 1);
                  const widthPct = Math.round((step.count / base) * 100);
                  const prevCount = idx > 0 ? data.funnel![idx - 1]!.count : step.count;
                  const stepRate = idx > 0 && prevCount > 0 ? Math.round((step.count / prevCount) * 100) : 100;
                  return (
                    <div key={step.stage} className="grid grid-cols-12 items-center gap-3 text-xs">
                      <div className="col-span-4 sm:col-span-3 font-medium text-slate-700 dark:text-slate-200 truncate">
                        {step.stage}
                      </div>
                      <div className="col-span-5 sm:col-span-7 h-5 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-600 dark:bg-blue-500 transition-all"
                          style={{ width: `${Math.max(step.count > 0 ? 4 : 0, Math.min(100, widthPct))}%` }}
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2 text-right font-mono tabular-nums">
                        <span className="font-semibold">{step.count}</span>
                        {idx > 0 && <span className="text-slate-400 ml-1">({stepRate}%)</span>}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {data.pipelineSummary && (
            <Card>
              <CardHeader>
                <CardTitle>Commercial Deal Pipeline</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Open Pipeline ({data.pipelineSummary.openDealsCount})</div>
                  <div className="font-mono text-lg font-semibold tabular-nums mt-1">
                    {formatCurrency(data.pipelineSummary.openPipelineValue)}
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Weighted Forecast</div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-400 mt-1">
                    {formatCurrency(data.pipelineSummary.weightedPipelineValue)}
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Closed Won</div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                    {formatCurrency(data.pipelineSummary.closedWonValue)}
                  </div>
                </div>
                <div className="p-3 rounded border border-slate-200 dark:border-slate-800">
                  <div className="text-slate-500">Deal Win Rate</div>
                  <div className="font-mono text-lg font-semibold tabular-nums mt-1">
                    {data.pipelineSummary.winRate}%
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Data Import &amp; Deduplication Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.importTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="companies" name="Companies" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="contacts" name="Contacts" fill="#0284c7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="duplicates" name="Duplicates" fill="#d97706" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Distribution &amp; Worked Progress Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.charts.distributionTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="distributed" name="Distributed" stroke="#1d4ed8" strokeWidth={2} />
                <Line type="monotone" dataKey="worked" name="Worked" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign-Wise Distribution &amp; Progress</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.campaignStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="assigned" name="Assigned" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="worked" name="Worked" fill="#0284c7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="interested" name="Interested" fill="#16a34a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="appointments" name="Appointments" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sales Representative Performance</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.charts.repPerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="calls" name="Calls" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="linkedin" name="LinkedIn" fill="#0284c7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="emails" name="Emails" fill="#0f766e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="appointments" name="Appointments" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outreach Channel Activity &amp; Appointments Timeline</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.charts.activityTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="calls" name="Calls" stroke="#1d4ed8" strokeWidth={2} />
                <Line type="monotone" dataKey="linkedin" name="LinkedIn" stroke="#0284c7" strokeWidth={2} />
                <Line type="monotone" dataKey="emails" name="Emails" stroke="#0f766e" strokeWidth={2} />
                <Line type="monotone" dataKey="appointments" name="Appointments" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Follow-up Status Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.charts.followUpStatusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={88}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {data.charts.followUpStatusBreakdown.map((entry, idx) => (
                    <Cell key={entry.status} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
