import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

import { formatCodeLabel } from '../lib/utils.ts';

export function DataRequestsPage() {
  const { user, refreshProfile } = useAuth();
  const [tab, setTab] = useState<'requests' | 'flags'>('requests');
  const [requests, setRequests] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [reviewItem, setReviewItem] = useState<any>(null);

  const [form, setForm] = useState({
    title: '',
    campaignId: '',
    industry: '',
    country: '',
    targetJobTitles: '',
    companySize: '',
    quantityRequired: '300',
    priority: 'HIGH',
    reason: '',
  });
  const [reviewForm, setReviewForm] = useState({ status: 'APPROVED', fulfilledQuantity: '0', managerRemarks: '' });

  const canReview = user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER' || user?.role === 'CAMPAIGN_MANAGER';

  const load = useCallback(async () => {
    const [reqRes, cmpRes, flagRes] = await Promise.all([
      apiFetch('/api/data-requests'),
      apiFetch('/api/campaigns'),
      apiFetch('/api/data-flags'),
    ]);
    setRequests(reqRes.dataRequests);
    setCampaigns(cmpRes.campaigns);
    setFlags(flagRes.flags || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateFlagStatus = async (id: number, status: string) => {
    try {
      await apiFetch(`/api/data-flags/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(`Data quality flag marked ${status.toLowerCase()}.`);
      await Promise.all([load(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update flag');
    }
  };

  const submitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/data-requests', {
        method: 'POST',
        body: JSON.stringify({ ...form, quantityRequired: Number(form.quantityRequired) }),
      });
      toast.success('Data request submitted.');
      setCreateOpen(false);
      setForm({ title: '', campaignId: '', industry: '', country: '', targetJobTitles: '', companySize: '', quantityRequired: '300', priority: 'HIGH', reason: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit request');
    }
  };

  const submitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewItem) return;
    try {
      await apiFetch(`/api/data-requests/${reviewItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: reviewForm.status,
          fulfilledQuantity: Number(reviewForm.fulfilledQuantity || 0),
          managerRemarks: reviewForm.managerRemarks,
        }),
      });
      toast.success('Data request updated.');
      setReviewItem(null);
      await Promise.all([load(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update request');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Prospecting Data Requests
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Request new target industry or geography datasets and track approval and fulfillment status.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Request New Data</span>
        </Button>
      </div>

      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit">
        <button
          onClick={() => setTab('requests')}
          className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
            tab === 'requests' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
          }`}
        >
          Dataset Requests ({requests.length})
        </button>
        <button
          onClick={() => setTab('flags')}
          className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
            tab === 'flags' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
          }`}
        >
          Data Quality Flags ({flags.filter((f) => f.status === 'OPEN').length} open)
        </button>
      </div>

      {tab === 'requests' ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Request</th>
                  <th className="py-3 px-4 font-medium">Target ICP</th>
                  <th className="py-3 px-4 font-medium">Requested By</th>
                  <th className="py-3 px-4 font-medium text-right">Qty</th>
                  <th className="py-3 px-4 font-medium">Priority</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canReview && <th className="py-3 px-4 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-slate-500">{r.campaignName} · {r.managerRemarks || r.reason || '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      <div>{r.industry || 'Any'} · {r.country || 'Any'}</div>
                      <div className="text-slate-400">{r.targetJobTitles || '—'}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">{r.requestedByName}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {r.fulfilledQuantity > 0 ? `${r.fulfilledQuantity}/` : ''}{r.quantityRequired}
                    </td>
                    <td className="py-3 px-4"><StatusLabel status={r.priority} /></td>
                    <td className="py-3 px-4"><StatusLabel status={r.status} /></td>
                    {canReview && (
                      <td className="py-3 px-4 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReviewItem(r);
                            setReviewForm({
                              status: r.status,
                              fulfilledQuantity: String(r.fulfilledQuantity || r.quantityRequired),
                              managerRemarks: r.managerRemarks || '',
                            });
                          }}
                        >
                          Review
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Company &amp; Contact</th>
                  <th className="py-3 px-4 font-medium">Issue Type</th>
                  <th className="py-3 px-4 font-medium">Proposed Fix &amp; Notes</th>
                  <th className="py-3 px-4 font-medium">Reported By</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  {canReview && <th className="py-3 px-4 font-medium text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {flags.length === 0 ? (
                  <tr><td colSpan={6} className="py-8 text-center text-slate-500">No data quality flags reported.</td></tr>
                ) : (
                  flags.map((f) => (
                    <tr key={f.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium">{f.companyName}</div>
                        <div className="text-xs text-slate-500">{f.contactName || 'Company-level'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium">{formatCodeLabel(f.issueType)}</td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {f.proposedFix && <div className="font-medium">Fix: {f.proposedFix}</div>}
                        <div>{f.notes || '—'}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">{f.reportedByName}</td>
                      <td className="py-3 px-4"><StatusLabel status={f.status} /></td>
                      {canReview && (
                        <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                          {f.status === 'OPEN' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => updateFlagStatus(f.id, 'RESOLVED')}>Resolve</Button>
                              <Button size="sm" variant="outline" onClick={() => updateFlagStatus(f.id, 'DISMISSED')}>Dismiss</Button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Submit New Data Request</DialogTitle></DialogHeader>
          <form onSubmit={submitRequest} className="space-y-3 mt-2">
            <div><Label>Request Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. 300 US SaaS CTOs" required /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Campaign</Label>
                <SelectField value={form.campaignId} onChange={(e) => setForm({ ...form, campaignId: e.target.value })}>
                  <option value="">General</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              </div>
              <div>
                <Label>Quantity Required *</Label>
                <Input type="number" min={1} value={form.quantityRequired} onChange={(e) => setForm({ ...form, quantityRequired: e.target.value })} required />
              </div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div><Label>Target Job Titles</Label><Input value={form.targetJobTitles} onChange={(e) => setForm({ ...form, targetJobTitles: e.target.value })} /></div>
              <div>
                <Label>Priority</Label>
                <SelectField value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </SelectField>
              </div>
            </div>
            <div><Label>Reason for Request</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Submit Request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reviewItem)} onOpenChange={(o) => !o && setReviewItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review Data Request — {reviewItem?.title}</DialogTitle></DialogHeader>
          <form onSubmit={submitReview} className="space-y-3 mt-2">
            <div>
              <Label>Decision / Status</Label>
              <SelectField value={reviewForm.status} onChange={(e) => setReviewForm({ ...reviewForm, status: e.target.value })}>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="REJECTED">Rejected</option>
              </SelectField>
            </div>
            <div>
              <Label>Fulfilled Quantity</Label>
              <Input type="number" value={reviewForm.fulfilledQuantity} onChange={(e) => setReviewForm({ ...reviewForm, fulfilledQuantity: e.target.value })} />
            </div>
            <div>
              <Label>Manager Remarks</Label>
              <Textarea value={reviewForm.managerRemarks} onChange={(e) => setReviewForm({ ...reviewForm, managerRemarks: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setReviewItem(null)}>Cancel</Button>
              <Button type="submit">Save Decision</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
