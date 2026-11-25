import React, { useCallback, useEffect, useState } from 'react';
import { Check, Flag, Plus, ShieldBan, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatCodeLabel } from '../lib/utils.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function DncCompliancePage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [flags, setFlags] = useState<any[]>([]);
  const [type, setType] = useState('DOMAIN');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  const canDeleteDnc = user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER';

  const load = useCallback(async () => {
    const [dncRes, flagRes] = await Promise.all([apiFetch('/api/dnc'), apiFetch('/api/data-flags')]);
    setEntries(dncRes.entries || []);
    setFlags(flagRes.flags || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addDnc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/dnc', {
        method: 'POST',
        body: JSON.stringify({ type, value, reason }),
      });
      toast.success('Added to Global DNC Suppression List');
      setValue('');
      setReason('');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add suppression entry');
    }
  };

  const removeDnc = async (id: number) => {
    await apiFetch(`/api/dnc/${id}`, { method: 'DELETE' });
    toast.success('Suppression entry removed');
    await load();
  };

  const resolveFlag = async (id: number, status: 'RESOLVED' | 'DISMISSED') => {
    await apiFetch(`/api/data-flags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    toast.success(`Data flag marked ${status}`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold">DNC Suppression &amp; Data Compliance</h1>
        <p className="text-sm text-slate-500">
          Global Do-Not-Contact suppression automatically blocks suppressed domains, emails, and phones from future imports and outreach.
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldBan className="h-4 w-4 text-red-600" /> Add to Global Suppression List</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addDnc} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-2">
              <Label>Type</Label>
              <SelectField value={type} onChange={(e) => setType(e.target.value)}>
                <option value="DOMAIN">Domain</option>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
              </SelectField>
            </div>
            <div className="sm:col-span-4">
              <Label>Value *</Label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={type === 'DOMAIN' ? 'example.com' : type === 'EMAIL' ? 'lead@example.com' : '+14155550100'}
                required
              />
            </div>
            <div className="sm:col-span-4">
              <Label>Compliance Reason</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="GDPR opt-out / Competitor" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="w-full"><Plus className="h-4 w-4" /> Suppress</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Active Suppression Entries ({entries.length})</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-y border-slate-200 dark:border-slate-800 text-left text-slate-500">
                <th className="py-2.5 px-4 font-medium">Type</th>
                <th className="py-2.5 px-4 font-medium">Normalized Value</th>
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-4 font-medium">Added By</th>
                <th className="py-2.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="py-2.5 px-4 font-medium">{e.type}</td>
                  <td className="py-2.5 px-4 font-mono">{e.value}</td>
                  <td className="py-2.5 px-4 text-slate-500">{e.reason || '—'}</td>
                  <td className="py-2.5 px-4">{e.addedByName}</td>
                  <td className="py-2.5 px-4 text-right">
                    {canDeleteDnc && (
                      <Button size="sm" variant="ghost" onClick={() => removeDnc(e.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="h-4 w-4 text-amber-600" /> Rep Data Correction / Enrichment Queue ({flags.length})</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-y border-slate-200 dark:border-slate-800 text-left text-slate-500">
                <th className="py-2.5 px-4 font-medium">Company / Contact</th>
                <th className="py-2.5 px-4 font-medium">Issue</th>
                <th className="py-2.5 px-4 font-medium">Proposed Fix &amp; Notes</th>
                <th className="py-2.5 px-4 font-medium">Reported By</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {flags.map((f) => (
                <tr key={f.id}>
                  <td className="py-2.5 px-4">
                    <div className="font-medium">{f.companyName}</div>
                    {f.contactName && <div className="text-slate-500">{f.contactName}</div>}
                  </td>
                  <td className="py-2.5 px-4">{formatCodeLabel(f.issueType)}</td>
                  <td className="py-2.5 px-4">
                    {f.proposedFix && <div className="font-mono text-emerald-700 dark:text-emerald-400">Suggested: {f.proposedFix}</div>}
                    <div className="text-slate-500">{f.notes || '—'}</div>
                  </td>
                  <td className="py-2.5 px-4">{f.reportedByName}</td>
                  <td className="py-2.5 px-4"><StatusLabel status={f.status} /></td>
                  <td className="py-2.5 px-4 text-right space-x-1">
                    {f.status === 'OPEN' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => resolveFlag(f.id, 'RESOLVED')}>
                          <Check className="h-3.5 w-3.5" /> Resolve
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => resolveFlag(f.id, 'DISMISSED')}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
