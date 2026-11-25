import React, { useCallback, useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Check, Clock, List } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { formatCodeLabel } from '../lib/utils.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function FollowUpsPage({ onOpenRecord }: { onOpenRecord: (recordId: number) => void }) {
  const { user, refreshProfile } = useAuth();
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [reps, setReps] = useState<Array<{ id: number; fullName: string }>>([]);
  const [tab, setTab] = useState<'today' | 'overdue' | 'upcoming' | 'all' | 'calendar'>('today');
  const [loading, setLoading] = useState(true);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDate, setBulkDate] = useState(() => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return tmr.toISOString().slice(0, 10);
  });
  const [bulkTime, setBulkTime] = useState('10:00');
  const [bulkRepId, setBulkRepId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [completeModal, setCompleteModal] = useState<any>(null);
  const [createNext, setCreateNext] = useState(false);
  const [nextDate, setNextDate] = useState('');
  const [nextTime, setNextTime] = useState('10:00');
  const [nextType, setNextType] = useState('CALL');
  const [nextNotes, setNextNotes] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const isManager = user && ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fupRes, empRes] = await Promise.all([
        apiFetch('/api/follow-ups'),
        isManager ? apiFetch('/api/employees').catch(() => ({ employees: [] })) : Promise.resolve({ employees: [] }),
      ]);
      setFollowUps(fupRes.followUps || []);
      const salesReps = (empRes.employees || []).filter((e: any) => e.role === 'SALES_REP' && e.isActive !== false);
      setReps(salesReps);
      setSelectedIds([]);
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    load();
  }, [load]);

  const markCompleted = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeModal) return;
    try {
      await apiFetch(`/api/follow-ups/${completeModal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'COMPLETED',
          createNext,
          nextDate,
          nextTime,
          nextType,
          nextNotes,
        }),
      });
      toast.success(createNext ? 'Follow-up completed and next follow-up scheduled.' : 'Follow-up marked completed.');
      setCompleteModal(null);
      setCreateNext(false);
      setNextDate('');
      setNextNotes('');
      await Promise.all([load(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update follow-up');
    }
  };

  const reschedule = async (id: number) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next = tomorrow.toISOString().slice(0, 10);
    await apiFetch(`/api/follow-ups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PENDING', followUpDate: next }),
    });
    toast.success(`Rescheduled to ${next}`);
    await load();
  };

  const handleBulk = async (action: 'COMPLETE' | 'RESCHEDULE' | 'REASSIGN') => {
    if (selectedIds.length === 0) return;
    if (action === 'REASSIGN' && !bulkRepId) {
      toast.error('Select a sales representative first.');
      return;
    }
    setBulkBusy(true);
    try {
      const res = await apiFetch('/api/follow-ups/bulk', {
        method: 'POST',
        body: JSON.stringify({
          ids: selectedIds,
          action,
          followUpDate: action === 'RESCHEDULE' ? bulkDate : undefined,
          followUpTime: action === 'RESCHEDULE' ? bulkTime : undefined,
          assignedToId: action === 'REASSIGN' ? Number(bulkRepId) : undefined,
        }),
      });
      toast.success(`Updated ${res.updatedCount} follow-up task(s).`);
      await Promise.all([load(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Bulk follow-up update failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = followUps.filter((f) => {
    if (tab === 'today') return f.followUpDate === today && (f.status === 'PENDING' || f.status === 'OVERDUE');
    if (tab === 'overdue') return f.status === 'OVERDUE';
    if (tab === 'upcoming') return f.followUpDate > today && f.status === 'PENDING';
    return true;
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const calendarDays = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i - 2);
    return d.toISOString().slice(0, 10);
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          Follow-up Task Manager
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Stay on top of due callbacks, emails, and LinkedIn follow-ups, or batch-complete and reschedule tasks.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit">
        {[
          { id: 'today', label: `Today (${followUps.filter((f) => f.followUpDate === today && f.status !== 'COMPLETED').length})` },
          { id: 'overdue', label: `Overdue (${followUps.filter((f) => f.status === 'OVERDUE').length})` },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'all', label: 'All History' },
          { id: 'calendar', label: 'Calendar View' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id as any);
              setSelectedIds([]);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              tab === t.id
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t.id === 'calendar' ? <CalendarIcon className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab !== 'calendar' && selectedIds.length > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
              {selectedIds.length} follow-up(s) selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={bulkBusy} onClick={() => handleBulk('COMPLETE')}>
                <Check className="h-3.5 w-3.5" /> Complete Selected
              </Button>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  className="h-8 w-36 text-xs"
                  value={bulkDate}
                  onChange={(e) => setBulkDate(e.target.value)}
                />
                <Input
                  type="time"
                  className="h-8 w-24 text-xs"
                  value={bulkTime}
                  onChange={(e) => setBulkTime(e.target.value)}
                />
                <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('RESCHEDULE')}>
                  <Clock className="h-3.5 w-3.5" /> Reschedule
                </Button>
              </div>
              {isManager && reps.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <SelectField className="h-8 w-44 text-xs" value={bulkRepId} onChange={(e) => setBulkRepId(e.target.value)}>
                    <option value="">Reassign to rep...</option>
                    {reps.map((r) => (
                      <option key={r.id} value={r.id}>{r.fullName}</option>
                    ))}
                  </SelectField>
                  <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('REASSIGN')}>
                    Reassign
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'calendar' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {calendarDays.map((day) => {
            const items = followUps.filter((f) => f.followUpDate === day);
            return (
              <Card key={day} className={day === today ? 'border-blue-600 dark:border-blue-500' : ''}>
                <CardHeader className="p-3">
                  <CardTitle className="text-xs font-mono">
                    {day} {day === today ? '(Today)' : ''}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-slate-400">No tasks</div>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onOpenRecord(item.campaignCompanyRecordId)}
                        className="p-2 rounded border border-slate-200 dark:border-slate-700 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <div className="font-medium truncate">{item.companyName}</div>
                        <div className="text-slate-500 font-mono">{item.followUpTime} · {formatCodeLabel(item.followUpType)}</div>
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
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((f) => selectedIds.includes(f.id))}
                      onChange={(e) => setSelectedIds(e.target.checked ? filtered.map((f) => f.id) : [])}
                    />
                  </th>
                  <th className="py-3 px-4 font-medium">Due Date &amp; Time</th>
                  <th className="py-3 px-4 font-medium">Company &amp; Contact</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Notes</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading follow-ups...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="py-8 text-center text-slate-500">No follow-ups in this view.</td></tr>
                ) : (
                  filtered.map((f) => (
                    <tr key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(f.id)}
                          onChange={() => toggleSelect(f.id)}
                        />
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                        {f.followUpDate} {f.followUpTime}
                      </td>
                      <td className="py-3 px-4 cursor-pointer" onClick={() => onOpenRecord(f.campaignCompanyRecordId)}>
                        <div className="font-medium text-blue-700 dark:text-blue-400 hover:underline">{f.companyName}</div>
                        <div className="text-xs text-slate-500">
                          {f.contactName || '—'} · {f.campaignName} {isManager && f.assignedToName ? `· ${f.assignedToName}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs">{formatCodeLabel(f.followUpType)}</td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">{f.notes || '—'}</td>
                      <td className="py-3 px-4"><StatusLabel status={f.status} /></td>
                      <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                        {f.status !== 'COMPLETED' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => reschedule(f.id)}>
                              <Clock className="h-3.5 w-3.5" /> +1d
                            </Button>
                            <Button size="sm" onClick={() => setCompleteModal(f)}>
                              <Check className="h-3.5 w-3.5" /> Complete
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={Boolean(completeModal)} onOpenChange={(o) => !o && setCompleteModal(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete Follow-up — {completeModal?.companyName}</DialogTitle></DialogHeader>
          <form onSubmit={markCompleted} className="space-y-4 mt-2">
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="createNext"
                checked={createNext}
                onChange={(e) => setCreateNext(e.target.checked)}
              />
              <label htmlFor="createNext" className="font-medium">Schedule another follow-up immediately</label>
            </div>
            {createNext && (
              <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Next Date *</Label><Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required /></div>
                  <div><Label>Next Time</Label><Input type="time" value={nextTime} onChange={(e) => setNextTime(e.target.value)} /></div>
                  <div>
                    <Label>Channel</Label>
                    <SelectField value={nextType} onChange={(e) => setNextType(e.target.value)}>
                      <option value="CALL">Call</option>
                      <option value="EMAIL">Email</option>
                      <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
                      <option value="WHATSAPP">WhatsApp</option>
                    </SelectField>
                  </div>
                </div>
                <div><Label>Notes</Label><Textarea value={nextNotes} onChange={(e) => setNextNotes(e.target.value)} /></div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCompleteModal(null)}>Cancel</Button>
              <Button type="submit">Confirm Completion</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
