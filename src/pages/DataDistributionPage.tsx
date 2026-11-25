import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch } from '../lib/api.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function DataDistributionPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [distData, setDistData] = useState<any>(null);
  const [salesReps, setSalesReps] = useState<any[]>([]);

  const [quotas, setQuotas] = useState<Record<number, string>>({});
  const [distributionDate, setDistributionDate] = useState(new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState('');
  const [instructions, setInstructions] = useState('');

  const [selectedRecordIds, setSelectedRecordIds] = useState<number[]>([]);
  const [reassignRepId, setReassignRepId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [sequences, setSequences] = useState<any[]>([]);
  const [enrollSeqId, setEnrollSeqId] = useState('');
  const [staleRecords, setStaleRecords] = useState<any[]>([]);
  const [daysIdle, setDaysIdle] = useState('5');
  const [busy, setBusy] = useState(false);

  const loadInitial = useCallback(async () => {
    try {
      const [cmpRes, empRes, seqRes] = await Promise.all([
        apiFetch('/api/campaigns'),
        apiFetch('/api/employees'),
        apiFetch('/api/sequences'),
      ]);
      setCampaigns(cmpRes.campaigns);
      setSalesReps(empRes.employees.filter((e: any) => e.role === 'SALES_REP' && e.isActive));
      setSequences(seqRes.sequences.filter((s: any) => s.isActive));
      if (cmpRes.campaigns.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(String(cmpRes.campaigns[0].id));
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load campaigns');
    }
  }, [selectedCampaignId]);

  const loadCampaignDist = useCallback(async () => {
    if (!selectedCampaignId) return;
    try {
      const [res, staleRes] = await Promise.all([
        apiFetch(`/api/distribution/campaigns/${selectedCampaignId}`),
        apiFetch(`/api/distribution/stale?daysIdle=${Number(daysIdle || 5)}`),
      ]);
      setDistData(res);
      setStaleRecords(staleRes.staleRecords || []);
      setSelectedRecordIds([]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load campaign distribution');
    }
  }, [selectedCampaignId, daysIdle]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    loadCampaignDist();
  }, [loadCampaignDist]);

  const handleBulkDistribute = async (e: React.FormEvent) => {
    e.preventDefault();
    const allocations = Object.entries(quotas)
      .map(([repId, countStr]) => ({ repId: Number(repId), count: Number(countStr) }))
      .filter((a) => a.count > 0);

    if (allocations.length === 0) {
      toast.error('Enter a record quantity for at least one representative.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiFetch('/api/distribution/assign', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: Number(selectedCampaignId),
          allocations,
          distributionDate,
          deadline,
          instructions,
        }),
      });
      toast.success(`Distributed ${res.totalAssigned} company record(s).`);
      setQuotas({});
      setInstructions('');
      await loadCampaignDist();
    } catch (err: any) {
      toast.error(err?.message || 'Distribution failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReassignSelected = async () => {
    if (selectedRecordIds.length === 0 || !reassignRepId) {
      toast.error('Select records and a target sales representative.');
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/api/distribution/reassign', {
        method: 'POST',
        body: JSON.stringify({
          recordIds: selectedRecordIds,
          newRepId: Number(reassignRepId),
          reason: reassignReason || 'Manager redistribution',
        }),
      });
      toast.success(`Reassigned ${selectedRecordIds.length} record(s) with activity history preserved.`);
      setSelectedRecordIds([]);
      setReassignReason('');
      await loadCampaignDist();
    } catch (err: any) {
      toast.error(err?.message || 'Reassignment failed');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedRecordIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleEnrollSequence = async () => {
    if (selectedRecordIds.length === 0 || !enrollSeqId) {
      toast.error('Select records and a cadence sequence.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/sequences/${enrollSeqId}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ recordIds: selectedRecordIds }),
      });
      toast.success(`Enrolled ${res.enrolledCount} record(s) into sequence.`);
      setSelectedRecordIds([]);
      await loadCampaignDist();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to enroll records');
    } finally {
      setBusy(false);
    }
  };

  const handleStaleAction = async (action: 'NOTIFY' | 'RECLAIM', ids?: number[]) => {
    const targetIds = ids || staleRecords.map((r) => r.id);
    if (targetIds.length === 0) return;
    setBusy(true);
    try {
      const res = await apiFetch('/api/distribution/reclaim-stale', {
        method: 'POST',
        body: JSON.stringify({ recordIds: targetIds, action }),
      });
      toast.success(
        action === 'NOTIFY'
          ? `Sent SLA warning notifications to ${res.notifiedReps} representative(s).`
          : `Reclaimed ${res.reclaimedCount} untouched record(s) back to the unassigned pool.`
      );
      await loadCampaignDist();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to process stale records');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Data Distribution &amp; Allocation
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Allocate approved campaign pools across representatives, enforce zero duplicate assignments, and reassign records safely.
          </p>
        </div>
        <SelectField className="sm:w-72" value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.campaignCode})</option>
          ))}
        </SelectField>
      </div>

      {distData && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Available', value: distData.stats.totalAvailable },
              { label: 'Approved Pool', value: distData.stats.approvedCount },
              { label: 'Total Distributed', value: distData.stats.distributedCount },
              { label: 'Remaining Unassigned', value: distData.stats.remainingUnassigned, tone: 'text-blue-700 dark:text-blue-400' },
              { label: 'Worked On', value: distData.stats.workedCount, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Pending Work', value: distData.stats.pendingCount, tone: 'text-amber-700 dark:text-amber-400' },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4">
                  <div className="text-xs text-slate-500">{s.label}</div>
                  <div className={`font-mono text-2xl font-semibold tabular-nums mt-1 ${s.tone || ''}`}>{s.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>Bulk Quantity Allocation</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={handleBulkDistribute} className="space-y-4">
                  <div className="space-y-2">
                    {salesReps.map((rep) => (
                      <div key={rep.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                        <div>
                          <div className="text-sm font-medium">{rep.fullName}</div>
                          <div className="text-xs text-slate-500">{rep.email}</div>
                        </div>
                        <Input
                          type="number"
                          min={0}
                          max={distData.stats.remainingUnassigned}
                          className="w-28 font-mono text-right"
                          placeholder="0"
                          value={quotas[rep.id] || ''}
                          onChange={(e) => setQuotas({ ...quotas, [rep.id]: e.target.value })}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Distribution Date</Label><Input type="date" value={distributionDate} onChange={(e) => setDistributionDate(e.target.value)} /></div>
                    <div><Label>Target Deadline</Label><Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></div>
                  </div>
                  <div>
                    <Label>Assignment Instructions</Label>
                    <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Focus on CTOs and log calls before LinkedIn..." />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy || distData.stats.remainingUnassigned === 0}>
                    {busy ? 'Distributing...' : `Distribute from Unassigned Pool (${distData.stats.remainingUnassigned} available)`}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Representative Allocation Progress</CardTitle></CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distData.repBreakdown}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="fullName" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="assignedCount" name="Assigned" fill="#1d4ed8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="workedCount" name="Worked" fill="#16a34a" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="pendingCount" name="Pending" fill="#d97706" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Records Table with Selection + Reassignment */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle>Campaign Prospect Records ({distData.records.length})</CardTitle>
              {selectedRecordIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono text-blue-700">{selectedRecordIds.length} selected</span>
                  <SelectField className="w-44 h-8 text-xs" value={reassignRepId} onChange={(e) => setReassignRepId(e.target.value)}>
                    <option value="">Assign / Reassign to...</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>{rep.fullName}</option>
                    ))}
                  </SelectField>
                  <Input
                    className="w-40 h-8 text-xs"
                    placeholder="Reason (optional)"
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                  />
                  <Button size="sm" onClick={handleReassignSelected} disabled={busy}>Reassign</Button>
                  {sequences.length > 0 && (
                    <>
                      <SelectField className="w-44 h-8 text-xs" value={enrollSeqId} onChange={(e) => setEnrollSeqId(e.target.value)}>
                        <option value="">Enroll in cadence...</option>
                        {sequences.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </SelectField>
                      <Button size="sm" variant="outline" onClick={handleEnrollSequence} disabled={busy}>Enroll</Button>
                    </>
                  )}
                </div>
              )}
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={distData.records.length > 0 && selectedRecordIds.length === distData.records.length}
                        onChange={(e) =>
                          setSelectedRecordIds(e.target.checked ? distData.records.map((r: any) => r.id) : [])
                        }
                      />
                    </th>
                    <th className="py-2.5 px-4 font-medium">Company</th>
                    <th className="py-2.5 px-4 font-medium">Industry / Country</th>
                    <th className="py-2.5 px-4 font-medium">Assigned Representative</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Due Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {distData.records.map((r: any) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4">
                        <input
                          type="checkbox"
                          checked={selectedRecordIds.includes(r.id)}
                          onChange={() => toggleSelect(r.id)}
                        />
                      </td>
                      <td className="py-2.5 px-4 font-medium">
                        {r.companyName} <span className="text-xs text-slate-400 font-mono ml-1">{r.domain}</span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-slate-500">{r.industry || '—'} · {r.country || '—'}</td>
                      <td className="py-2.5 px-4 text-xs font-medium">{r.assignedToName || <span className="text-slate-400">Unassigned</span>}</td>
                      <td className="py-2.5 px-4"><StatusLabel status={r.status} /></td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs">{r.dueDate || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Assignment History */}
          <Card>
            <CardHeader><CardTitle>Assignment &amp; Reassignment History</CardTitle></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Timestamp</th>
                    <th className="py-2.5 px-4 font-medium">Action</th>
                    <th className="py-2.5 px-4 font-medium">Previous Assignee</th>
                    <th className="py-2.5 px-4 font-medium">New Assignee</th>
                    <th className="py-2.5 px-4 font-medium">By</th>
                    <th className="py-2.5 px-4 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {distData.history.map((h: any) => (
                    <tr key={h.id}>
                      <td className="py-2.5 px-4 font-mono">{h.createdAt.slice(0, 16).replace('T', ' ')}</td>
                      <td className="py-2.5 px-4 font-medium">{h.action}</td>
                      <td className="py-2.5 px-4">{h.previousAssigneeName || 'Pool'}</td>
                      <td className="py-2.5 px-4 font-medium">{h.newAssigneeName}</td>
                      <td className="py-2.5 px-4">{h.changedByName}</td>
                      <td className="py-2.5 px-4 text-slate-500">{h.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          {/* SLA / Stale Lead Detection & Reclaim */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>SLA / Stale Untouched Leads ({staleRecords.length})</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detect assigned leads untouched past SLA or due date and remind reps or reclaim back to the pool.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Label className="mb-0 text-xs">Idle days:</Label>
                <Input
                  type="number"
                  min={1}
                  className="w-20 h-8 text-xs font-mono"
                  value={daysIdle}
                  onChange={(e) => setDaysIdle(e.target.value)}
                />
                {staleRecords.length > 0 && (
                  <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleStaleAction('NOTIFY')}>
                      Send SLA Reminder
                    </Button>
                    <Button size="sm" variant="outline" className="text-amber-700" disabled={busy} onClick={() => handleStaleAction('RECLAIM')}>
                      Reclaim All to Pool
                    </Button>
                  </>
                )}
              </div>
            </CardHeader>
            {staleRecords.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <tr>
                      <th className="py-2.5 px-4 font-medium">Company</th>
                      <th className="py-2.5 px-4 font-medium">Assigned Rep</th>
                      <th className="py-2.5 px-4 font-medium">SLA Trigger</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {staleRecords.slice(0, 25).map((sr) => (
                      <tr key={sr.id}>
                        <td className="py-2.5 px-4 font-medium">{sr.companyName}</td>
                        <td className="py-2.5 px-4">{sr.assignedToName}</td>
                        <td className="py-2.5 px-4 text-amber-700 dark:text-amber-400">{sr.reason}</td>
                        <td className="py-2.5 px-4 text-right space-x-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStaleAction('NOTIFY', [sr.id])}>
                            Remind
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleStaleAction('RECLAIM', [sr.id])}>
                            Reclaim
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
