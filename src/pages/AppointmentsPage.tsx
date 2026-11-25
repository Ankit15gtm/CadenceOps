import React, { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, ExternalLink, List } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { safeExternalUrl } from '../lib/utils.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function AppointmentsPage({ onOpenRecord }: { onOpenRecord: (recordId: number) => void }) {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/appointments');
      setAppointments(res.appointments);
      setSummary(res.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          confirmationStatus: status === 'CONFIRMED' ? 'CONFIRMED' : undefined,
        }),
      });
      toast.success('Appointment status updated');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update appointment');
    }
  };

  const upcomingDays = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i - 2);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Appointment Management &amp; Calendar
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track scheduled discovery meetings, confirmations, completions, reschedules, and no-shows.
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer ${
              view === 'list' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            <List className="h-3.5 w-3.5" /> List
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer ${
              view === 'calendar' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" /> Calendar
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Appointments', value: summary.total },
            { label: 'Scheduled / Pending', value: summary.scheduled },
            { label: 'Confirmed', value: summary.confirmed, tone: 'text-emerald-700 dark:text-emerald-400' },
            { label: 'Completed', value: summary.completed, tone: 'text-blue-700 dark:text-blue-400' },
            { label: 'Rescheduled', value: summary.rescheduled, tone: 'text-amber-700 dark:text-amber-400' },
            { label: 'No-Shows', value: summary.noShows, tone: 'text-red-700 dark:text-red-400' },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="p-4">
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className={`font-mono text-2xl font-semibold tabular-nums mt-1 ${m.tone || ''}`}>{m.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {view === 'calendar' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {upcomingDays.map((day) => {
            const items = appointments.filter((a) => a.appointmentDate === day);
            return (
              <Card key={day}>
                <CardHeader className="p-3"><CardTitle className="text-xs font-mono">{day}</CardTitle></CardHeader>
                <CardContent className="p-3 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-slate-400">Open</div>
                  ) : (
                    items.map((ap) => (
                      <div
                        key={ap.id}
                        onClick={() => onOpenRecord(ap.campaignCompanyRecordId)}
                        className="p-2 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/30 text-xs cursor-pointer"
                      >
                        <div className="font-semibold truncate">{ap.companyName}</div>
                        <div className="text-slate-600 dark:text-slate-300 truncate">{ap.prospectName}</div>
                        <div className="font-mono text-slate-500 mt-0.5">{ap.appointmentTime}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Date &amp; Time</th>
                  <th className="py-3 px-4 font-medium">Company &amp; Prospect</th>
                  <th className="py-3 px-4 font-medium">Campaign</th>
                  <th className="py-3 px-4 font-medium">Rep</th>
                  <th className="py-3 px-4 font-medium">Meeting Details</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading appointments...</td></tr>
                ) : appointments.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">No appointments booked yet.</td></tr>
                ) : (
                  appointments.map((ap) => (
                    <tr key={ap.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-xs tabular-nums">
                        <div>{ap.appointmentDate} {ap.appointmentTime}</div>
                        <div className="text-slate-400">{ap.timezone}</div>
                      </td>
                      <td className="py-3 px-4 cursor-pointer" onClick={() => onOpenRecord(ap.campaignCompanyRecordId)}>
                        <div className="font-medium text-blue-700 dark:text-blue-400 hover:underline">{ap.companyName}</div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">{ap.prospectName} · {ap.prospectTitle || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">{ap.campaignName}</td>
                      <td className="py-3 px-4 text-xs">{ap.assignedToName}</td>
                      <td className="py-3 px-4 text-xs">
                        <div>{ap.meetingType}</div>
                        {safeExternalUrl(ap.meetingLink) && (
                          <a href={safeExternalUrl(ap.meetingLink)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                            <ExternalLink className="h-3 w-3" /> Link
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-4"><StatusLabel status={ap.status} /></td>
                      <td className="py-3 px-4 text-right">
                        <SelectField
                          className="w-40 h-8 text-xs inline-block"
                          value={ap.status}
                          onChange={(e) => updateStatus(ap.id, e.target.value)}
                        >
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="CONFIRMED">Confirmed</option>
                          <option value="PENDING_CONFIRMATION">Pending Confirmation</option>
                          <option value="RESCHEDULED">Rescheduled</option>
                          <option value="COMPLETED">Completed</option>
                          <option value="NO_SHOW">No Show</option>
                          <option value="CANCELLED">Cancelled</option>
                        </SelectField>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
