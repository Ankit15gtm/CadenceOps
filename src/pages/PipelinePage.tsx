import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, DollarSign, Edit3, Kanban, List, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { formatCurrency } from '../lib/utils.ts';
import { DEAL_STAGES, getDealStageMeta } from '../lib/deals.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';

interface DealRecord {
  id: number;
  dealCode: string;
  title: string;
  campaignId: number | null;
  campaignCompanyRecordId: number | null;
  companyId: number;
  contactId: number | null;
  ownerId: number;
  stage: string;
  amount: number;
  probability: number;
  expectedCloseDate: string | null;
  lossReason: string | null;
  notes: string | null;
  companyName: string;
  companyDomain: string | null;
  contactName: string | null;
  campaignName: string | null;
  ownerName: string;
}

export function PipelinePage({ onOpenRecord }: { onOpenRecord?: (recordId: number) => void }) {
  const { user } = useAuth();
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [options, setOptions] = useState<{
    companies: Array<{ id: number; name: string }>;
    campaigns: Array<{ id: number; name: string }>;
    owners: Array<{ id: number; fullName: string }>;
  }>({ companies: [], campaigns: [], owners: [] });

  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [search, setSearch] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<DealRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    companyId: '',
    campaignId: '',
    ownerId: '',
    stage: 'DISCOVERY',
    amount: '25000',
    probability: '20',
    expectedCloseDate: '',
    lossReason: '',
    notes: '',
  });

  const isManager = user && ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (campaignFilter) params.set('campaignId', campaignFilter);
      if (ownerFilter) params.set('ownerId', ownerFilter);
      const res = await apiFetch(`/api/deals?${params.toString()}`);
      setDeals(res.deals || []);
      setSummary(res.summary || null);
      if (res.options) setOptions(res.options);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load deal pipeline');
    } finally {
      setLoading(false);
    }
  }, [search, campaignFilter, ownerFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const openNewDeal = () => {
    setEditingDeal(null);
    setForm({
      title: '',
      companyId: options.companies[0] ? String(options.companies[0].id) : '',
      campaignId: '',
      ownerId: user ? String(user.id) : '',
      stage: 'DISCOVERY',
      amount: '25000',
      probability: '20',
      expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      lossReason: '',
      notes: '',
    });
    setModalOpen(true);
  };

  const openEditDeal = (d: DealRecord) => {
    setEditingDeal(d);
    setForm({
      title: d.title,
      companyId: String(d.companyId),
      campaignId: d.campaignId ? String(d.campaignId) : '',
      ownerId: String(d.ownerId),
      stage: d.stage,
      amount: String(d.amount),
      probability: String(d.probability),
      expectedCloseDate: d.expectedCloseDate || '',
      lossReason: d.lossReason || '',
      notes: d.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingDeal) {
        await apiFetch(`/api/deals/${editingDeal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: form.title,
            stage: form.stage,
            amount: Number(form.amount || 0),
            probability: Number(form.probability || 0),
            expectedCloseDate: form.expectedCloseDate || null,
            lossReason: form.lossReason || null,
            notes: form.notes || null,
            ownerId: form.ownerId ? Number(form.ownerId) : undefined,
          }),
        });
        toast.success('Deal updated.');
      } else {
        await apiFetch('/api/deals', {
          method: 'POST',
          body: JSON.stringify({
            title: form.title,
            companyId: Number(form.companyId),
            campaignId: form.campaignId ? Number(form.campaignId) : null,
            ownerId: form.ownerId ? Number(form.ownerId) : undefined,
            stage: form.stage,
            amount: Number(form.amount || 0),
            probability: Number(form.probability || 0),
            expectedCloseDate: form.expectedCloseDate || null,
            lossReason: form.lossReason || null,
            notes: form.notes || null,
          }),
        });
        toast.success('Opportunity added to pipeline.');
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save deal');
    } finally {
      setSaving(false);
    }
  };

  const handleStageChange = async (dealId: number, stage: string) => {
    try {
      await apiFetch(`/api/deals/${dealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      });
      toast.success(`Moved deal to ${getDealStageMeta(stage).label}`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to move deal stage');
    }
  };

  const handleDelete = async (dealId: number) => {
    try {
      await apiFetch(`/api/deals/${dealId}`, { method: 'DELETE' });
      toast.success('Deal removed.');
      setModalOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete deal');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Opportunity &amp; Deal Pipeline
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Track qualified opportunities from discovery through closed revenue, forecast weighted pipeline, and inspect win rates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer ${
                view === 'kanban' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              <Kanban className="h-3.5 w-3.5" /> Board
            </button>
            <button
              type="button"
              onClick={() => setView('table')}
              className={`px-3 py-1.5 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer ${
                view === 'table' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              <List className="h-3.5 w-3.5" /> Table
            </button>
          </div>
          <Button onClick={openNewDeal}>
            <Plus className="h-4 w-4" />
            <span>New Deal</span>
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Open Pipeline ({summary.openDealsCount} deals)</div>
              <div className="font-mono text-2xl font-semibold tabular-nums mt-1 text-slate-900 dark:text-white">
                {formatCurrency(summary.openPipelineValue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Weighted Forecast</div>
              <div className="font-mono text-2xl font-semibold tabular-nums mt-1 text-blue-700 dark:text-blue-400">
                {formatCurrency(summary.weightedPipelineValue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Closed Won Revenue ({summary.wonCount})</div>
              <div className="font-mono text-2xl font-semibold tabular-nums mt-1 text-emerald-700 dark:text-emerald-400">
                {formatCurrency(summary.closedWonValue)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-slate-500">Win Rate ({summary.wonCount}W / {summary.lostCount}L)</div>
              <div className="font-mono text-2xl font-semibold tabular-nums mt-1 text-slate-900 dark:text-white">
                {summary.winRate}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              className="pl-9"
              placeholder="Search deal title, code, company, or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectField className="sm:w-56" value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
            <option value="">All Campaigns</option>
            {options.campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </SelectField>
          {isManager && (
            <SelectField className="sm:w-52" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
              <option value="">All Deal Owners</option>
              {options.owners.map((o) => (
                <option key={o.id} value={o.id}>{o.fullName}</option>
              ))}
            </SelectField>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-64 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : view === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 items-start">
          {DEAL_STAGES.map((stage) => {
            const stageDeals = deals.filter((d) => d.stage === stage.value);
            const stageTotal = stageDeals.reduce((s, d) => s + d.amount, 0);
            return (
              <div
                key={stage.value}
                className={`rounded-lg border border-slate-200 dark:border-slate-800 border-t-4 ${stage.columnBorder} bg-slate-50/70 dark:bg-slate-900/60 p-3 space-y-2.5 min-h-[320px]`}
              >
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-white">{stage.label}</div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {stageDeals.length} deal{stageDeals.length === 1 ? '' : 's'} · {formatCurrency(stageTotal)}
                    </div>
                  </div>
                </div>

                {stageDeals.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">No deals in {stage.label}</div>
                ) : (
                  stageDeals.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-mono text-slate-400">{d.dealCode}</div>
                          <div className="text-xs font-semibold text-slate-900 dark:text-white leading-snug">{d.title}</div>
                          <div className="text-xs text-blue-700 dark:text-blue-400 truncate mt-0.5">{d.companyName}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditDeal(d)}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer shrink-0"
                          title="Edit deal"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white flex items-center gap-0.5">
                          <DollarSign className="h-3 w-3 text-emerald-600" />
                          {d.amount.toLocaleString()}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-slate-500">{d.probability}% prob</span>
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                        <span className="truncate">{d.ownerName}</span>
                        <span className="font-mono tabular-nums shrink-0">{d.expectedCloseDate || 'No close date'}</span>
                      </div>

                      {d.lossReason && d.stage === 'CLOSED_LOST' && (
                        <div className="text-[11px] text-red-700 dark:text-red-400 bg-red-50/70 dark:bg-red-950/30 px-2 py-1 rounded border border-red-200 dark:border-red-900">
                          Loss: {d.lossReason}
                        </div>
                      )}

                      <div className="flex items-center gap-1.5 pt-1">
                        <SelectField
                          className="h-7 text-[11px] flex-1"
                          value={d.stage}
                          onChange={(e) => handleStageChange(d.id, e.target.value)}
                        >
                          {DEAL_STAGES.map((st) => (
                            <option key={st.value} value={st.value}>{st.label}</option>
                          ))}
                        </SelectField>
                        {d.campaignCompanyRecordId && onOpenRecord && (
                          <button
                            type="button"
                            onClick={() => onOpenRecord(d.campaignCompanyRecordId!)}
                            className="h-7 px-2 rounded border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-0.5 cursor-pointer shrink-0"
                            title="Open Prospect Record"
                          >
                            <ArrowUpRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                <tr>
                  <th className="py-3 px-4 font-medium">Deal</th>
                  <th className="py-3 px-4 font-medium">Company &amp; Campaign</th>
                  <th className="py-3 px-4 font-medium">Stage</th>
                  <th className="py-3 px-4 font-medium text-right">Amount</th>
                  <th className="py-3 px-4 font-medium text-right">Prob.</th>
                  <th className="py-3 px-4 font-medium">Expected Close</th>
                  <th className="py-3 px-4 font-medium">Owner</th>
                  <th className="py-3 px-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {deals.length === 0 ? (
                  <tr><td colSpan={8} className="py-10 text-center text-slate-500">No deals match current filters.</td></tr>
                ) : (
                  deals.map((d) => {
                    const meta = getDealStageMeta(d.stage);
                    return (
                      <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900 dark:text-white">{d.title}</div>
                          <div className="text-xs font-mono text-slate-400">{d.dealCode}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-xs font-medium text-blue-700 dark:text-blue-400">{d.companyName}</div>
                          <div className="text-xs text-slate-500">{d.campaignName || 'Direct Opportunity'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded border text-xs font-medium ${meta.badgeStyle}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums">{formatCurrency(d.amount)}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">{d.probability}%</td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums">{d.expectedCloseDate || '—'}</td>
                        <td className="py-3 px-4 text-xs">{d.ownerName}</td>
                        <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                          {d.campaignCompanyRecordId && onOpenRecord && (
                            <Button size="sm" variant="outline" onClick={() => onOpenRecord(d.campaignCompanyRecordId!)}>
                              Prospect
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEditDeal(d)}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingDeal ? `Edit Deal — ${editingDeal.dealCode}` : 'Create Opportunity Deal'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-3 mt-2">
            <div>
              <Label>Deal Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Enterprise Security Posture License"
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Company *</Label>
                <SelectField
                  value={form.companyId}
                  onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                  disabled={Boolean(editingDeal)}
                  required
                >
                  <option value="">Select company...</option>
                  {options.companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                <Label>Source Campaign</Label>
                <SelectField
                  value={form.campaignId}
                  onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
                  disabled={Boolean(editingDeal)}
                >
                  <option value="">None / Direct</option>
                  {options.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                <Label>Pipeline Stage *</Label>
                <SelectField
                  value={form.stage}
                  onChange={(e) => {
                    const nextStage = e.target.value;
                    const prob = getDealStageMeta(nextStage).defaultProbability;
                    setForm({ ...form, stage: nextStage, probability: String(prob) });
                  }}
                >
                  {DEAL_STAGES.map((st) => (
                    <option key={st.value} value={st.value}>{st.label}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                <Label>Deal Value (USD) *</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Win Probability (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.probability}
                  onChange={(e) => setForm({ ...form, probability: e.target.value })}
                />
              </div>
              <div>
                <Label>Expected Close Date</Label>
                <Input
                  type="date"
                  value={form.expectedCloseDate}
                  onChange={(e) => setForm({ ...form, expectedCloseDate: e.target.value })}
                />
              </div>
              {isManager && (
                <div className="sm:col-span-2">
                  <Label>Deal Owner</Label>
                  <SelectField value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                    {options.owners.map((o) => (
                      <option key={o.id} value={o.id}>{o.fullName}</option>
                    ))}
                  </SelectField>
                </div>
              )}
            </div>

            {form.stage === 'CLOSED_LOST' && (
              <div>
                <Label>Loss Reason</Label>
                <Input
                  value={form.lossReason}
                  onChange={(e) => setForm({ ...form, lossReason: e.target.value })}
                  placeholder="e.g. Budget frozen, selected competitor, timing"
                />
              </div>
            )}

            <div>
              <Label>Commercial Notes &amp; Next Steps</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="flex items-center justify-between pt-2">
              {editingDeal ? (
                <Button type="button" variant="outline" className="text-red-600" onClick={() => handleDelete(editingDeal.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Deal
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingDeal ? 'Save Changes' : 'Create Deal'}</Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
