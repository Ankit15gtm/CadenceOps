import React, { useCallback, useEffect, useState } from 'react';
import { GitBranch, Mail, MessageSquare, PhoneCall, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatCodeLabel } from '../lib/utils.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function TemplatesSequencesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'templates' | 'sequences'>('templates');
  const [templates, setTemplates] = useState<any[]>([]);
  const [sequences, setSequences] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [tplOpen, setTplOpen] = useState(false);
  const [seqOpen, setSeqOpen] = useState(false);

  const canManage =
    user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER' || user?.role === 'CAMPAIGN_MANAGER';

  const [tplForm, setTplForm] = useState({
    name: '',
    channel: 'EMAIL',
    campaignId: '',
    subject: '',
    body: '',
  });

  const [seqForm, setSeqForm] = useState({
    name: '',
    campaignId: '',
    description: '',
    stopOnReply: true,
    stopOnAppointment: true,
    steps: [
      { delayDays: 0, channel: 'PHONE_CALL', templateId: '', instructions: 'Initial call + voicemail' },
      { delayDays: 2, channel: 'EMAIL', templateId: '', instructions: 'Send intro email' },
    ],
  });

  const load = useCallback(async () => {
    const [tRes, sRes, cRes] = await Promise.all([
      apiFetch('/api/templates'),
      apiFetch('/api/sequences'),
      apiFetch('/api/campaigns'),
    ]);
    setTemplates(tRes.templates || []);
    setSequences(sRes.sequences || []);
    setCampaigns(cRes.campaigns || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/templates', {
        method: 'POST',
        body: JSON.stringify({
          ...tplForm,
          campaignId: tplForm.campaignId ? Number(tplForm.campaignId) : null,
        }),
      });
      toast.success('Template saved');
      setTplOpen(false);
      setTplForm({ name: '', channel: 'EMAIL', campaignId: '', subject: '', body: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save template');
    }
  };

  const deleteTemplate = async (id: number) => {
    await apiFetch(`/api/templates/${id}`, { method: 'DELETE' });
    toast.success('Template removed');
    await load();
  };

  const createSequence = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/sequences', {
        method: 'POST',
        body: JSON.stringify({
          name: seqForm.name,
          campaignId: seqForm.campaignId ? Number(seqForm.campaignId) : null,
          description: seqForm.description,
          stopOnReply: seqForm.stopOnReply,
          stopOnAppointment: seqForm.stopOnAppointment,
          steps: seqForm.steps.map((st) => ({
            delayDays: Number(st.delayDays),
            channel: st.channel,
            templateId: st.templateId ? Number(st.templateId) : null,
            instructions: st.instructions,
          })),
        }),
      });
      toast.success('Automated cadence created');
      setSeqOpen(false);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create sequence');
    }
  };

  const toggleSequence = async (seq: any) => {
    await apiFetch(`/api/sequences/${seq.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !seq.isActive }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold">Outreach Templates &amp; Automated Cadences</h1>
          <p className="text-sm text-slate-500">
            Configure reusable merge-tag messaging, call scripts, and multi-touch follow-up sequences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            <button
              type="button"
              onClick={() => setTab('templates')}
              className={`px-3 py-1.5 rounded font-medium cursor-pointer ${
                tab === 'templates' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Templates &amp; Scripts ({templates.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('sequences')}
              className={`px-3 py-1.5 rounded font-medium cursor-pointer ${
                tab === 'sequences' ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              Cadence Sequences ({sequences.length})
            </button>
          </div>
          {canManage && tab === 'templates' && (
            <Button onClick={() => setTplOpen(true)}>
              <Plus className="h-4 w-4" /> New Template
            </Button>
          )}
          {canManage && tab === 'sequences' && (
            <Button onClick={() => setSeqOpen(true)}>
              <Plus className="h-4 w-4" /> New Sequence
            </Button>
          )}
        </div>
      </div>

      {tab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => {
            const cmp = campaigns.find((c) => c.id === t.campaignId);
            const Icon = t.channel === 'EMAIL' ? Mail : t.channel === 'CALL_SCRIPT' ? PhoneCall : MessageSquare;
            return (
              <Card key={t.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <Icon className="h-3.5 w-3.5 text-blue-600" />
                      <span>{formatCodeLabel(t.channel)}</span>
                      <span>·</span>
                      <span>{cmp ? cmp.name : 'Global Template'}</span>
                    </div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                  </div>
                  {canManage && (
                    <Button size="sm" variant="ghost" onClick={() => deleteTemplate(t.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {t.subject && (
                    <div className="font-medium text-slate-700 dark:text-slate-300">
                      Subject: {t.subject}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-3 rounded border border-slate-100 dark:border-slate-800">
                    {t.body}
                  </pre>
                  <div className="text-[11px] text-slate-400">
                    Merge tags: {'{{first_name}}'}, {'{{full_name}}'}, {'{{company_name}}'}, {'{{job_title}}'}, {'{{sender_name}}'}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {tab === 'sequences' && (
        <div className="space-y-4">
          {sequences.map((seq) => {
            const cmp = campaigns.find((c) => c.id === seq.campaignId);
            return (
              <Card key={seq.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <GitBranch className="h-4 w-4 text-blue-600" />
                      <CardTitle className="text-base">{seq.name}</CardTitle>
                      <StatusLabel status={seq.isActive ? 'ACTIVE' : 'PAUSED'} />
                    </div>
                    <p className="text-xs text-slate-500">
                      {cmp ? cmp.name : 'Global Cadence'} · {seq.description || 'Multi-channel outreach cadence'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="tabular-nums text-slate-600 dark:text-slate-300">
                      Active: <strong>{seq.activeEnrollments}</strong> · Stopped: <strong>{seq.stoppedEnrollments}</strong> · Completed: <strong>{seq.completedEnrollments}</strong>
                    </span>
                    {canManage && (
                      <Button size="sm" variant="outline" onClick={() => toggleSequence(seq)}>
                        {seq.isActive ? 'Pause' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {(seq.steps || []).map((st: any) => (
                      <div key={st.id} className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 text-xs space-y-1">
                        <div className="flex items-center justify-between font-medium">
                          <span>Step {st.stepOrder}: {formatCodeLabel(st.channel)}</span>
                          <span className="text-slate-500 tabular-nums">+{st.delayDays}d</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">{st.instructions || 'Outreach touchpoint'}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500 flex gap-4">
                    <span>Auto-stop on positive reply: {seq.stopOnReply ? 'Enabled' : 'Disabled'}</span>
                    <span>Auto-stop on appointment: {seq.stopOnAppointment ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Template Modal */}
      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Create Outreach Template / Call Script</DialogTitle></DialogHeader>
          <form onSubmit={createTemplate} className="space-y-3 mt-2">
            <div>
              <Label>Template Name *</Label>
              <Input value={tplForm.name} onChange={(e) => setTplForm({ ...tplForm, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Channel *</Label>
                <SelectField value={tplForm.channel} onChange={(e) => setTplForm({ ...tplForm, channel: e.target.value })}>
                  <option value="EMAIL">Email Template</option>
                  <option value="CALL_SCRIPT">Call Script</option>
                  <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
                  <option value="WHATSAPP">WhatsApp Message</option>
                </SelectField>
              </div>
              <div>
                <Label>Campaign Scope</Label>
                <SelectField value={tplForm.campaignId} onChange={(e) => setTplForm({ ...tplForm, campaignId: e.target.value })}>
                  <option value="">Global (All Campaigns)</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              </div>
            </div>
            {tplForm.channel === 'EMAIL' && (
              <div>
                <Label>Email Subject</Label>
                <Input
                  value={tplForm.subject}
                  onChange={(e) => setTplForm({ ...tplForm, subject: e.target.value })}
                  placeholder="Quick question on {{company_name}}"
                />
              </div>
            )}
            <div>
              <Label>Message / Script Body *</Label>
              <Textarea
                rows={6}
                value={tplForm.body}
                onChange={(e) => setTplForm({ ...tplForm, body: e.target.value })}
                placeholder="Hi {{first_name}}, ..."
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTplOpen(false)}>Cancel</Button>
              <Button type="submit">Save Template</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Sequence Modal */}
      <Dialog open={seqOpen} onOpenChange={setSeqOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Create Multi-Touch Outreach Sequence</DialogTitle></DialogHeader>
          <form onSubmit={createSequence} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Sequence Name *</Label>
                <Input value={seqForm.name} onChange={(e) => setSeqForm({ ...seqForm, name: e.target.value })} required />
              </div>
              <div>
                <Label>Campaign</Label>
                <SelectField value={seqForm.campaignId} onChange={(e) => setSeqForm({ ...seqForm, campaignId: e.target.value })}>
                  <option value="">Global (All Campaigns)</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </SelectField>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={seqForm.description} onChange={(e) => setSeqForm({ ...seqForm, description: e.target.value })} />
            </div>
            <div className="flex gap-6 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seqForm.stopOnReply}
                  onChange={(e) => setSeqForm({ ...seqForm, stopOnReply: e.target.checked })}
                />
                <span>Auto-stop on positive reply</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={seqForm.stopOnAppointment}
                  onChange={(e) => setSeqForm({ ...seqForm, stopOnAppointment: e.target.checked })}
                />
                <span>Auto-stop on appointment booked</span>
              </label>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Sequence Steps</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setSeqForm({
                      ...seqForm,
                      steps: [...seqForm.steps, { delayDays: 3, channel: 'EMAIL', templateId: '', instructions: '' }],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </Button>
              </div>
              {seqForm.steps.map((st, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center p-2.5 border border-slate-200 dark:border-slate-800 rounded">
                  <div className="sm:col-span-2 text-xs font-medium">Step {idx + 1}</div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      min={0}
                      value={st.delayDays}
                      onChange={(e) => {
                        const next = [...seqForm.steps];
                        next[idx]!.delayDays = Number(e.target.value);
                        setSeqForm({ ...seqForm, steps: next });
                      }}
                      title="Delay days after previous step"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <SelectField
                      value={st.channel}
                      onChange={(e) => {
                        const next = [...seqForm.steps];
                        next[idx]!.channel = e.target.value;
                        setSeqForm({ ...seqForm, steps: next });
                      }}
                    >
                      <option value="PHONE_CALL">Phone Call</option>
                      <option value="EMAIL">Email</option>
                      <option value="LINKEDIN_CONNECTION">LinkedIn Connect</option>
                      <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
                      <option value="WHATSAPP">WhatsApp</option>
                    </SelectField>
                  </div>
                  <div className="sm:col-span-4">
                    <Input
                      value={st.instructions}
                      placeholder="Step instructions"
                      onChange={(e) => {
                        const next = [...seqForm.steps];
                        next[idx]!.instructions = e.target.value;
                        setSeqForm({ ...seqForm, steps: next });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    {seqForm.steps.length > 1 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setSeqForm({ ...seqForm, steps: seqForm.steps.filter((_, i) => i !== idx) })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSeqOpen(false)}>Cancel</Button>
              <Button type="submit">Create Sequence</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
