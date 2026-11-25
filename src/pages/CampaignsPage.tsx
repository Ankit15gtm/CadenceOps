import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export interface CampaignRow {
  id: number;
  campaignCode: string;
  name: string;
  description: string | null;
  clientName: string | null;
  objective: string | null;
  targetIndustry: string | null;
  targetCountries: string | null;
  targetJobTitles: string | null;
  targetCompanySize: string | null;
  startDate: string | null;
  endDate: string | null;
  status: string;
  targetCompaniesCount: number;
  totalImported: number;
  totalAllocated: number;
  totalWorked: number;
  totalAppointments: number;
  campaignManagerName: string | null;
  dataManagerName: string | null;
}

export function CampaignsPage({ onOpenCampaign }: { onOpenCampaign: (id: number) => void }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const [form, setForm] = useState({
    name: '',
    clientName: '',
    objective: '',
    description: '',
    targetIndustry: '',
    targetCountries: '',
    targetJobTitles: '',
    targetCompanySize: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    status: 'ACTIVE',
    targetCompaniesCount: '100',
    instructions: '',
    qualificationCriteria: '',
    qualificationQuestionsText: '',
  });
  const [saving, setSaving] = useState(false);

  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER' || user?.role === 'CAMPAIGN_MANAGER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ campaigns: CampaignRow[] }>('/api/campaigns');
      setCampaigns(res.campaigns);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const questions = form.qualificationQuestionsText
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean);
      await apiFetch('/api/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          targetCompaniesCount: Number(form.targetCompaniesCount || 0),
          qualificationQuestions: questions,
        }),
      });
      toast.success('Campaign created successfully.');
      setCreateOpen(false);
      setForm({
        name: '',
        clientName: '',
        objective: '',
        description: '',
        targetIndustry: '',
        targetCountries: '',
        targetJobTitles: '',
        targetCompanySize: '',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: '',
        status: 'ACTIVE',
        targetCompaniesCount: '100',
        instructions: '',
        qualificationCriteria: '',
        qualificationQuestionsText: '',
      });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create campaign');
    } finally {
      setSaving(false);
    }
  };

  const filtered = campaigns.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const hay = `${c.name} ${c.campaignCode} ${c.clientName || ''} ${c.targetIndustry || ''}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Campaign Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Organize target ICP campaigns, instructions, qualification rules, data allocations, and team performance.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>New Campaign</span>
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              className="pl-9"
              placeholder="Search campaigns by name, code, client, or industry..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectField className="sm:w-48" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </SelectField>
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-48 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-slate-500 mb-3">No campaigns match the current filters.</p>
            {canManage && (
              <Button size="sm" onClick={() => setCreateOpen(true)}>Create First Campaign</Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 bg-slate-50/70 dark:bg-slate-900/50">
                <tr>
                  <th className="py-3 px-4 font-medium">Campaign</th>
                  <th className="py-3 px-4 font-medium">Target ICP</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium text-right">Imported</th>
                  <th className="py-3 px-4 font-medium text-right">Allocated</th>
                  <th className="py-3 px-4 font-medium text-right">Worked</th>
                  <th className="py-3 px-4 font-medium text-right">Appointments</th>
                  <th className="py-3 px-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    onClick={() => onOpenCampaign(c.id)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{c.name}</div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {c.campaignCode} {c.clientName ? `· ${c.clientName}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      <div>{c.targetIndustry || '—'}</div>
                      <div className="text-slate-400 mt-0.5">{c.targetCountries || 'Global'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <StatusLabel status={c.status} />
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.totalImported}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.totalAllocated}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.totalWorked}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                      {c.totalAppointments}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCampaign(c.id);
                        }}
                      >
                        <span>Open</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Prospecting Campaign</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Campaign Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label>Client / Project Name</Label>
                <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div>
                <Label>Target Industry</Label>
                <Input value={form.targetIndustry} onChange={(e) => setForm({ ...form, targetIndustry: e.target.value })} placeholder="e.g. SaaS, FinTech" />
              </div>
              <div>
                <Label>Target Countries</Label>
                <Input value={form.targetCountries} onChange={(e) => setForm({ ...form, targetCountries: e.target.value })} placeholder="e.g. United States, UK" />
              </div>
              <div>
                <Label>Target Job Titles</Label>
                <Input value={form.targetJobTitles} onChange={(e) => setForm({ ...form, targetJobTitles: e.target.value })} placeholder="e.g. CTO, VP Engineering" />
              </div>
              <div>
                <Label>Target Company Size</Label>
                <Input value={form.targetCompanySize} onChange={(e) => setForm({ ...form, targetCompanySize: e.target.value })} placeholder="e.g. 200-2,000" />
              </div>
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div>
                <Label>Initial Status</Label>
                <SelectField value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="DRAFT">Draft</option>
                  <option value="READY">Ready</option>
                  <option value="ACTIVE">Active</option>
                </SelectField>
              </div>
              <div>
                <Label>Target Companies Count</Label>
                <Input type="number" value={form.targetCompaniesCount} onChange={(e) => setForm({ ...form, targetCompaniesCount: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Campaign Objective</Label>
              <Input value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} />
            </div>
            <div>
              <Label>Campaign Instructions for Representatives</Label>
              <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </div>
            <div>
              <Label>Lead Qualification Criteria</Label>
              <Textarea value={form.qualificationCriteria} onChange={(e) => setForm({ ...form, qualificationCriteria: e.target.value })} />
            </div>
            <div>
              <Label>Qualification Questions (one per line)</Label>
              <Textarea
                value={form.qualificationQuestionsText}
                onChange={(e) => setForm({ ...form, qualificationQuestionsText: e.target.value })}
                placeholder="How are you managing cloud compliance today?&#10;Who owns budget approval?"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Campaign'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
