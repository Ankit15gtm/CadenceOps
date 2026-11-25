import React, { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, CalendarPlus, CheckCircle2, DollarSign, Download, ExternalLink, List } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { safeExternalUrl } from '../lib/utils.ts';
import { DEAL_STAGES, getDealStageMeta } from '../lib/deals.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { createGoogleCalendarAppointment, downloadAppointmentIcs } from '../lib/googleWorkspace.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function AppointmentsPage({ onOpenRecord }: { onOpenRecord: (recordId: number) => void }) {
  const { googleAccessToken, connectGoogleWorkspace } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [loading, setLoading] = useState(true);
  const [syncTarget, setSyncTarget] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [dealTarget, setDealTarget] = useState<any>(null);
  const [dealForm, setDealForm] = useState({
    title: '',
    stage: 'DISCOVERY',
    amount: '35000',
    probability: '25',
    expectedCloseDate: '',
    notes: '',
  });
  const [savingDeal, setSavingDeal] = useState(false);

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

  const handleConfirmGoogleCalendarSync = async () => {
    if (!syncTarget) return;
    setSyncing(true);
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await connectGoogleWorkspace();
      }
      if (!token) {
        throw new Error('Google Workspace permission is required to sync to Google Calendar.');
      }

      const created = await createGoogleCalendarAppointment(token, {
        summary: `Discovery Call — ${syncTarget.companyName || syncTarget.prospectName}`,
        description: `${syncTarget.requirements || ''}\n${syncTarget.notes || ''}`.trim(),
        date: syncTarget.appointmentDate,
        time: syncTarget.appointmentTime,
        timeZone: syncTarget.timezone || 'America/New_York',
        attendeeEmail: syncTarget.prospectEmail,
      });

      await apiFetch(`/api/appointments/${syncTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          googleEventId: created.eventId,
          meetingLink: syncTarget.meetingLink || created.meetLink,
          calendarSynced: true,
        }),
      });

      toast.success('Synced appointment to Google Calendar.');
      setSyncTarget(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to sync appointment to Google Calendar');
    } finally {
      setSyncing(false);
    }
  };

  const openCreateDeal = (ap: any) => {
    setDealTarget(ap);
    setDealForm({
      title: `${ap.companyName} — Discovery Opportunity`,
      stage: 'DISCOVERY',
      amount: '35000',
      probability: '25',
      expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      notes: ap.requirements || ap.notes || '',
    });
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dealTarget) return;
    setSavingDeal(true);
    try {
      await apiFetch('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          title: dealForm.title,
          companyId: dealTarget.companyId,
          campaignId: dealTarget.campaignId,
          campaignCompanyRecordId: dealTarget.campaignCompanyRecordId,
          contactId: dealTarget.contactId || null,
          stage: dealForm.stage,
          amount: Number(dealForm.amount || 0),
          probability: Number(dealForm.probability || 20),
          expectedCloseDate: dealForm.expectedCloseDate || null,
          notes: dealForm.notes || null,
        }),
      });
      toast.success('Opportunity created in Deal Pipeline.');
      setDealTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create deal');
    } finally {
      setSavingDeal(false);
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
            Track scheduled discovery meetings, sync invites to Google Calendar, download .ics files, and update attendance outcomes.
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
                  <th className="py-3 px-4 font-medium">Meeting &amp; Calendar</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
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
                      <td className="py-3 px-4 text-xs space-y-1">
                        <div>{ap.meetingType}</div>
                        <div className="flex flex-wrap items-center gap-2">
                          {safeExternalUrl(ap.meetingLink) && (
                            <a href={safeExternalUrl(ap.meetingLink)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                              <ExternalLink className="h-3 w-3" /> Link
                            </a>
                          )}
                          {ap.calendarSynced ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px]">
                              <CheckCircle2 className="h-3 w-3" /> Calendar Synced
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSyncTarget(ap)}
                              className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                            >
                              <CalendarPlus className="h-3 w-3" /> Sync Google Calendar
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4"><StatusLabel status={ap.status} /></td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {ap.status !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => openCreateDeal(ap)}
                            title="Create pipeline deal from appointment"
                          >
                            <DollarSign className="h-3.5 w-3.5" /> Deal
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => downloadAppointmentIcs(ap)}
                          title="Download .ics invite"
                        >
                          <Download className="h-3.5 w-3.5" /> .ics
                        </Button>
                        <SelectField
                          className="w-36 h-8 text-xs inline-block"
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

      {/* MANDATORY Google Calendar Sync Confirmation */}
      <Dialog open={Boolean(syncTarget)} onOpenChange={(o) => !o && setSyncTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm Google Calendar Sync</DialogTitle></DialogHeader>
          {syncTarget && (
            <div className="space-y-3 text-sm mt-2">
              <p className="text-slate-600 dark:text-slate-300">
                Create this event on your connected Google Calendar and send a Meet invite?
              </p>
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div><span className="text-slate-400">Title:</span> Discovery Call — {syncTarget.companyName || syncTarget.prospectName}</div>
                <div><span className="text-slate-400">When:</span> <span className="font-mono">{syncTarget.appointmentDate} {syncTarget.appointmentTime} ({syncTarget.timezone})</span></div>
                <div><span className="text-slate-400">Attendee:</span> <span className="font-mono">{syncTarget.prospectEmail || 'None'}</span></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSyncTarget(null)} disabled={syncing}>Cancel</Button>
                <Button onClick={handleConfirmGoogleCalendarSync} disabled={syncing}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{syncing ? 'Syncing...' : 'Confirm & Sync to Calendar'}</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(dealTarget)} onOpenChange={(o) => !o && setDealTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Pipeline Deal — {dealTarget?.companyName}</DialogTitle></DialogHeader>
          {dealTarget && (
            <form onSubmit={handleCreateDeal} className="space-y-3 mt-2">
              <div>
                <Label>Deal Title *</Label>
                <Input value={dealForm.title} onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Stage</Label>
                  <SelectField
                    value={dealForm.stage}
                    onChange={(e) => {
                      const nextStage = e.target.value;
                      setDealForm({
                        ...dealForm,
                        stage: nextStage,
                        probability: String(getDealStageMeta(nextStage).defaultProbability),
                      });
                    }}
                  >
                    {DEAL_STAGES.map((st) => (
                      <option key={st.value} value={st.value}>{st.label}</option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <Label>Deal Value (USD)</Label>
                  <Input type="number" min={0} value={dealForm.amount} onChange={(e) => setDealForm({ ...dealForm, amount: e.target.value })} required />
                </div>
                <div>
                  <Label>Win Probability (%)</Label>
                  <Input type="number" min={0} max={100} value={dealForm.probability} onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })} />
                </div>
                <div>
                  <Label>Expected Close Date</Label>
                  <Input type="date" value={dealForm.expectedCloseDate} onChange={(e) => setDealForm({ ...dealForm, expectedCloseDate: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Commercial Notes</Label>
                <Textarea rows={3} value={dealForm.notes} onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDealTarget(null)}>Cancel</Button>
                <Button type="submit" disabled={savingDeal}>{savingDeal ? 'Creating...' : 'Create Deal'}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
