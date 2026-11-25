import React, { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { safeExternalUrl, formatCodeLabel } from '../lib/utils.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [validation, setValidation] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [addOpen, setAddOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    website: '',
    domain: '',
    linkedinUrl: '',
    industry: '',
    employeeSize: '',
    country: '',
    revenue: '',
    description: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (validation) params.set('validation', validation);
      const res = await apiFetch<{ companies: any[] }>(`/api/companies?${params.toString()}`);
      setCompanies(res.companies);
      setPage(1);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, [search, validation]);

  useEffect(() => {
    load();
  }, [load]);

  const openCompany = async (id: number) => {
    try {
      const res = await apiFetch(`/api/companies/${id}`);
      setDetail(res);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load company history');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/companies', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Company added to centralized database.');
      setAddOpen(false);
      setForm({ name: '', website: '', domain: '', linkedinUrl: '', industry: '', employeeSize: '', country: '', revenue: '', description: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create company');
    }
  };

  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const paged = companies.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Centralized Company Database
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Deduplicated master company directory with cross-campaign history, AI/fit scoring, and validation status.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Add Company</span>
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              className="pl-9"
              placeholder="Search by company name, domain, industry, or country..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <SelectField className="sm:w-48" value={validation} onChange={(e) => setValidation(e.target.value)}>
            <option value="">All Validation States</option>
            <option value="VALID">Valid</option>
            <option value="MISSING_INFO">Missing Info</option>
            <option value="INVALID">Invalid</option>
          </SelectField>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Company</th>
                <th className="py-3 px-4 font-medium">Industry &amp; Size</th>
                <th className="py-3 px-4 font-medium">Country</th>
                <th className="py-3 px-4 font-medium text-right">Contacts</th>
                <th className="py-3 px-4 font-medium text-right">Campaigns</th>
                <th className="py-3 px-4 font-medium text-right">AI / Fit</th>
                <th className="py-3 px-4 font-medium">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading companies...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">No companies found.</td></tr>
              ) : (
                paged.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => openCompany(c.id)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{c.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.domain || c.website || 'No domain'}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                      {c.industry || '—'} · {c.employeeSize || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs">{c.country || '—'}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.contactsCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">{c.campaignsCount}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                      {c.aiScore} / {c.fitScore}
                    </td>
                    <td className="py-3 px-4"><StatusLabel status={c.validationStatus} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Showing {paged.length} of {companies.length} unique companies</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <span className="font-mono tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      {/* Add Company Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Company (Duplicate Checked)</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Company Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
              <div><Label>Website</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://acme.com" /></div>
              <div><Label>Domain</Label><Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" /></div>
              <div><Label>LinkedIn Company URL</Label><Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} /></div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></div>
              <div><Label>Employee Size</Label><Input value={form.employeeSize} onChange={(e) => setForm({ ...form, employeeSize: e.target.value })} /></div>
              <div><Label>Country</Label><Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} /></div>
              <div><Label>Revenue</Label><Input value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Save Company</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Company Detail Modal */}
      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.company.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 mt-2 text-sm">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                  <span>{detail.company.industry || 'Industry N/A'}</span>
                  <span>·</span>
                  <span>{detail.company.employeeSize || 'Size N/A'} employees</span>
                  <span>·</span>
                  <span>{detail.company.country || 'Country N/A'}</span>
                  <span>·</span>
                  <span className="font-mono">AI: {detail.company.aiScore} / Fit: {detail.company.fitScore}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {safeExternalUrl(detail.company.website) && (
                    <a href={safeExternalUrl(detail.company.website)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Open Website
                    </a>
                  )}
                  {safeExternalUrl(detail.company.linkedinUrl) && (
                    <a href={safeExternalUrl(detail.company.linkedinUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline">
                      <ExternalLink className="h-3.5 w-3.5" /> Company LinkedIn
                    </a>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Associated Campaigns &amp; Representatives</h4>
                  {detail.campaignHistory.length === 0 ? (
                    <p className="text-xs text-slate-500">Not enrolled in any campaigns yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                      {detail.campaignHistory.map((h: any) => (
                        <div key={h.id} className="px-3 py-2 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-medium">{h.campaignName}</span>
                            <span className="text-slate-500 ml-2">Rep: {h.assignedToName || 'Unassigned'}</span>
                          </div>
                          <StatusLabel status={h.status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Contacts ({detail.contacts.length})</h4>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                    {detail.contacts.map((ct: any) => (
                      <div key={ct.id} className="px-3 py-2 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium">{ct.fullName} · {ct.jobTitle || 'Role N/A'}</div>
                          <div className="text-slate-500 font-mono">{ct.workEmail || 'No email'} · {ct.phone || 'No phone'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Cross-Campaign Outreach Timeline ({detail.activities.length})</h4>
                  {detail.activities.length === 0 ? (
                    <p className="text-xs text-slate-500">No historical outreach logged.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detail.activities.map((a: any) => (
                        <div key={a.id} className="text-xs border-b border-slate-100 dark:border-slate-800 pb-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{formatCodeLabel(a.channel)} — {a.campaignName}</span>
                            <span className="font-mono text-slate-400">{a.activityDate} {a.activityTime}</span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-400 mt-0.5">{a.repName}: {a.notes || formatCodeLabel(a.outcome)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
