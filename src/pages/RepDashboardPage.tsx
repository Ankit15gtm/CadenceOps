import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';
import type { NavRoute } from '../components/AppShell.tsx';

interface RepDashboardData {
  summary: {
    assignedCampaigns: number;
    totalAssignedCompanies: number;
    notYetWorked: number;
    worked: number;
    researched: number;
    followUpsDueToday: number;
    overdueFollowUps: number;
    followUpsPending: number;
    appointmentsBooked: number;
    appointmentsCompleted: number;
    interestedProspects: number;
    qualifiedLeads: number;
    callsAttempted: number;
    callsConnected: number;
    linkedinConnections: number;
    linkedinMessages: number;
    emailsSent: number;
    whatsappMessages: number;
    dailyActivitiesCount: number;
    weeklyActivitiesCount: number;
  };
  targets?: {
    dailyCallTarget: number;
    dailyOutreachTarget: number;
    todayCalls: number;
    todayOutreach: number;
  };
  leaderboard?: Array<{
    id: number;
    fullName: string;
    todayOutreach: number;
    totalOutreach: number;
    appointmentsBooked: number;
  }>;
  myCampaigns: Array<{
    id: number;
    campaignCode: string;
    name: string;
    status: string;
    assignedCount: number;
    workedCount: number;
  }>;
  dailyActivityChart: Array<{ date: string; calls: number; linkedin: number; emails: number; whatsapp: number }>;
}

export function RepDashboardPage({ onNavigate }: { onNavigate: (route: NavRoute) => void }) {
  const [data, setData] = useState<RepDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<RepDashboardData>('/api/dashboard/rep')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading || !data) {
    return <div className="h-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  const s = data.summary;
  const kpis = [
    { label: 'My Assigned Campaigns', value: s.assignedCampaigns },
    { label: 'Total Assigned Companies', value: s.totalAssignedCompanies },
    { label: 'Not Yet Worked', value: s.notYetWorked, tone: 'text-amber-700 dark:text-amber-400' },
    { label: 'Worked Companies', value: s.worked },
    { label: 'Follow-ups Due Today', value: s.followUpsDueToday, tone: 'text-blue-700 dark:text-blue-400' },
    { label: 'Overdue Follow-ups', value: s.overdueFollowUps, tone: 'text-red-700 dark:text-red-400' },
    { label: 'Appointments Booked', value: s.appointmentsBooked, tone: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Interested Prospects', value: s.interestedProspects, tone: 'text-blue-700 dark:text-blue-400' },
    { label: 'Qualified Leads', value: s.qualifiedLeads, tone: 'text-emerald-700 dark:text-emerald-400' },
    { label: 'Calls Attempted', value: s.callsAttempted },
    { label: 'Calls Connected', value: s.callsConnected },
    { label: 'LinkedIn Requests', value: s.linkedinConnections },
    { label: 'LinkedIn Messages', value: s.linkedinMessages },
    { label: 'Emails Sent', value: s.emailsSent },
    { label: 'WhatsApp Messages', value: s.whatsappMessages },
    { label: 'Weekly Activity', value: s.weeklyActivitiesCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            My Prospecting Performance
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track your assigned prospecting pipeline, daily outreach output, pending follow-ups, and booked appointments.
          </p>
        </div>
        <Button onClick={() => onNavigate('workspace')}>
          <span>Open Prospecting Queue</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {data.targets && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Daily Phone Call Quota</span>
                <span className="font-mono tabular-nums font-semibold">
                  {data.targets.todayCalls} / {data.targets.dailyCallTarget}
                </span>
              </div>
              <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-700"
                  style={{ width: `${Math.min(100, Math.round((data.targets.todayCalls / Math.max(1, data.targets.dailyCallTarget)) * 100))}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-600 dark:text-slate-300">Daily Total Outreach Quota</span>
                <span className="font-mono tabular-nums font-semibold">
                  {data.targets.todayOutreach} / {data.targets.dailyOutreachTarget}
                </span>
              </div>
              <div className="h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-600"
                  style={{ width: `${Math.min(100, Math.round((data.targets.todayOutreach / Math.max(1, data.targets.dailyOutreachTarget)) * 100))}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</div>
              <div className={`mt-1.5 font-mono text-2xl font-semibold tabular-nums ${k.tone || 'text-slate-900 dark:text-white'}`}>
                {k.value.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Multi-Channel Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.dailyActivityChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="calls" name="Calls" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="linkedin" name="LinkedIn" fill="#0284c7" radius={[3, 3, 0, 0]} />
                <Bar dataKey="emails" name="Emails" fill="#0f766e" radius={[3, 3, 0, 0]} />
                <Bar dataKey="whatsapp" name="WhatsApp" fill="#16a34a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Assigned Campaigns</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
            {data.myCampaigns.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">No campaigns assigned yet.</div>
            ) : (
              data.myCampaigns.map((c) => (
                <div key={c.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{c.name}</div>
                    <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                      {c.workedCount} / {c.assignedCount} worked
                    </div>
                  </div>
                  <StatusLabel status={c.status} />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {data.leaderboard && data.leaderboard.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Team Sales Leaderboard</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Rank</th>
                  <th className="py-2.5 px-4 font-medium">Representative</th>
                  <th className="py-2.5 px-4 font-medium text-right">Today Outreach</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total Outreach</th>
                  <th className="py-2.5 px-4 font-medium text-right">Appointments Booked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.leaderboard.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="py-2.5 px-4 font-mono text-xs">#{idx + 1}</td>
                    <td className="py-2.5 px-4 font-medium">{row.fullName}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.todayOutreach}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums">{row.totalOutreach}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">{row.appointmentsBooked}</td>
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
