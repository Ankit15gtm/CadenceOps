import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { formatCodeLabel } from '../lib/utils.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function ActivitiesPage({ onOpenRecord }: { onOpenRecord: (recordId: number) => void }) {
  const [activities, setActivities] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [channel, setChannel] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (campaignId) params.set('campaignId', campaignId);
      if (channel) params.set('channel', channel);
      const [actRes, cmpRes] = await Promise.all([
        apiFetch(`/api/activities?${params.toString()}`),
        apiFetch('/api/campaigns'),
      ]);
      setActivities(actRes.activities);
      setCampaigns(cmpRes.campaigns);
    } finally {
      setLoading(false);
    }
  }, [campaignId, channel]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Outreach Activity Log
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Permanent chronological record of calls, LinkedIn requests, messages, emails, and WhatsApp outreach.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <SelectField className="sm:w-64" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            <option value="">All Campaigns</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <SelectField className="sm:w-56" value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">All Channels</option>
            <option value="PHONE_CALL">Phone Call</option>
            <option value="LINKEDIN_CONNECTION">LinkedIn Connection</option>
            <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="OTHER">Other</option>
          </SelectField>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Date &amp; Time</th>
                <th className="py-3 px-4 font-medium">Company &amp; Contact</th>
                <th className="py-3 px-4 font-medium">Campaign</th>
                <th className="py-3 px-4 font-medium">Channel</th>
                <th className="py-3 px-4 font-medium">Rep</th>
                <th className="py-3 px-4 font-medium">Resulting Status</th>
                <th className="py-3 px-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading activities...</td></tr>
              ) : activities.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">No outreach activities recorded.</td></tr>
              ) : (
                activities.map((a) => (
                  <tr
                    key={a.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => onOpenRecord(a.campaignCompanyRecordId)}
                  >
                    <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">{a.activityDate} {a.activityTime}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium">{a.companyName}</div>
                      <div className="text-xs text-slate-500">{a.contactName || 'Company-level'}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">{a.campaignName}</td>
                    <td className="py-3 px-4 text-xs font-medium">{formatCodeLabel(a.channel)}</td>
                    <td className="py-3 px-4 text-xs">{a.repName}</td>
                    <td className="py-3 px-4"><StatusLabel status={a.resultingStatus} /></td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">{a.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
