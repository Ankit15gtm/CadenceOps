import React, { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { apiDownloadCsv, apiFetch } from '../lib/api.ts';
import { formatCodeLabel } from '../lib/utils.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function ReportsPage() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<'employees' | 'campaigns' | 'datamanagers' | 'activities'>('employees');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (campaignId) params.set('campaignId', campaignId);
    if (channel) params.set('channel', channel);

    const [repRes, cmpRes] = await Promise.all([
      apiFetch(`/api/reports/overview?${params.toString()}`),
      apiFetch('/api/campaigns'),
    ]);
    setData(repRes);
    setCampaigns(cmpRes.campaigns);
  }, [startDate, endDate, campaignId, channel]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCsv = async (type: 'activities' | 'campaigns') => {
    try {
      await apiDownloadCsv(`/api/reports/export?type=${type}`, `cadenceops_${type}_report.csv`);
      toast.success('CSV report downloaded.');
    } catch {
      toast.error('Failed to download report.');
    }
  };

  if (!data) {
    return <div className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Sales Operations &amp; Performance Reports
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Compare representative output, campaign conversion, data manager throughput, and export activity logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCsv('campaigns')}>
            <Download className="h-3.5 w-3.5" /> Campaigns CSV
          </Button>
          <Button size="sm" onClick={() => exportCsv('activities')}>
            <Download className="h-3.5 w-3.5" /> Activities CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          <div><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          <div>
            <Label>Campaign</Label>
            <SelectField value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">All Campaigns</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectField>
          </div>
          <div>
            <Label>Channel</Label>
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

      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit">
        {[
          { id: 'employees', label: 'Employee Performance' },
          { id: 'campaigns', label: 'Campaign Performance' },
          { id: 'datamanagers', label: 'Data Manager Performance' },
          { id: 'activities', label: 'Activity Report' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
              tab === t.id ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'employees' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Representative</th>
                  <th className="py-3 px-4 font-medium text-right">Assigned</th>
                  <th className="py-3 px-4 font-medium text-right">Worked</th>
                  <th className="py-3 px-4 font-medium text-right">Calls (Conn.)</th>
                  <th className="py-3 px-4 font-medium text-right">LinkedIn</th>
                  <th className="py-3 px-4 font-medium text-right">Emails</th>
                  <th className="py-3 px-4 font-medium text-right">Interested / Qual.</th>
                  <th className="py-3 px-4 font-medium text-right">Appointments</th>
                  <th className="py-3 px-4 font-medium text-right">Conv. Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.employeePerformance.map((e: any) => (
                  <tr key={e.id}>
                    <td className="py-3 px-4 font-medium">{e.name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.assignedData}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.workedData}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.callAttempts} ({e.connectedCalls})</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.linkedinOutreach}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.emails}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.interestedProspects} / {e.qualifiedLeads}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">{e.appointments}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{e.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'campaigns' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Campaign</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Imported</th>
                  <th className="py-3 px-4 font-medium text-right">Assigned</th>
                  <th className="py-3 px-4 font-medium text-right">Worked</th>
                  <th className="py-3 px-4 font-medium text-right">Outreach</th>
                  <th className="py-3 px-4 font-medium text-right">Interested</th>
                  <th className="py-3 px-4 font-medium text-right">Appointments</th>
                  <th className="py-3 px-4 font-medium text-right">Conv. Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.campaignPerformance.map((c: any) => (
                  <tr key={c.id}>
                    <td className="py-3 px-4 font-medium">{c.name}</td>
                    <td className="py-3 px-4"><StatusLabel status={c.status} /></td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.importedCompanies}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.assigned}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.worked}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.totalOutreach}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.interestedProspects}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">{c.appointments}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'datamanagers' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Data Manager / Admin</th>
                  <th className="py-3 px-4 font-medium text-right">Import Batches</th>
                  <th className="py-3 px-4 font-medium text-right">Companies Imported</th>
                  <th className="py-3 px-4 font-medium text-right">Duplicates Caught</th>
                  <th className="py-3 px-4 font-medium text-right">Records Distributed</th>
                  <th className="py-3 px-4 font-medium text-right">Requests Fulfilled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.dataManagerPerformance.map((d: any) => (
                  <tr key={d.id}>
                    <td className="py-3 px-4 font-medium">{d.name}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.totalBatches}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.totalImported}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.duplicatesDetected}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.recordsDistributed}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{d.requestsFulfilled}</td>
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
            <table className="w-full text-xs text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Date</th>
                  <th className="py-2.5 px-4 font-medium">Campaign</th>
                  <th className="py-2.5 px-4 font-medium">Company</th>
                  <th className="py-2.5 px-4 font-medium">Rep</th>
                  <th className="py-2.5 px-4 font-medium">Channel</th>
                  <th className="py-2.5 px-4 font-medium">Result</th>
                  <th className="py-2.5 px-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.activityLogs.map((a: any) => (
                  <tr key={a.id}>
                    <td className="py-2.5 px-4 font-mono tabular-nums">{a.date} {a.time}</td>
                    <td className="py-2.5 px-4">{a.campaignName}</td>
                    <td className="py-2.5 px-4 font-medium">{a.companyName}</td>
                    <td className="py-2.5 px-4">{a.repName}</td>
                    <td className="py-2.5 px-4">{formatCodeLabel(a.channel)}</td>
                    <td className="py-2.5 px-4"><StatusLabel status={a.resultingStatus} /></td>
                    <td className="py-2.5 px-4 text-slate-500 max-w-xs truncate">{a.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
