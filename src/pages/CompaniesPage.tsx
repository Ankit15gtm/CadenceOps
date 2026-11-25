import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Bookmark, Download, Edit3, ExternalLink, GitMerge, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDownloadCsv, apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { safeExternalUrl, formatCodeLabel } from '../lib/utils.ts';
import { getRemarkCategoryLabel, getRemarkCategoryStyle, getSentimentStyle } from '../lib/remarks.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function CompaniesPage() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [validation, setValidation] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkCampaignId, setBulkCampaignId] = useState('');
  const [newViewName, setNewViewName] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<any>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [customFieldKeys, setCustomFieldKeys] = useState<string[]>([]);

  const [form, setForm] = useState({
    name: '',
    website: '',
    domain: '',
    linkedinUrl: '',
    industry: '',
    employeeSize: '',
    country: '',
    revenue: '',
    timezone: 'America/New_York',
    description: '',
    customFields: {} as Record<string, string>,
  });

  const isManager = user?.role !== 'SALES_REP';
  const canMergeOrDelete = user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (validation) params.set('validation', validation);
      if (includeArchived) params.set('includeArchived', 'true');
      const [compRes, cmpRes, viewRes, cfRes] = await Promise.all([
        apiFetch<{ companies: any[] }>(`/api/companies?${params.toString()}`),
        apiFetch<{ campaigns: any[] }>('/api/campaigns'),
        apiFetch<{ views: any[] }>('/api/saved-views?page=companies').catch(() => ({ views: [] })),
        apiFetch<{ companyFields: string[] }>('/api/custom-fields').catch(() => ({ companyFields: [] })),
      ]);
      setCompanies(compRes.companies);
      setCampaigns(cmpRes.campaigns);
      setSavedViews(viewRes.views);
      setCustomFieldKeys(cfRes.companyFields || []);
      setSelectedIds([]);
      setPage(1);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  }, [search, validation, includeArchived]);

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
      setForm({
        name: '',
        website: '',
        domain: '',
        linkedinUrl: '',
        industry: '',
        employeeSize: '',
        country: '',
        revenue: '',
        timezone: 'America/New_York',
        description: '',
        customFields: {},
      });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create company');
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompany) return;
    try {
      await apiFetch(`/api/companies/${editCompany.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editCompany),
      });
      toast.success('Company updated.');
      setEditCompany(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update company');
    }
  };

  const handleBulkAction = async (action: 'ARCHIVE' | 'UNARCHIVE' | 'ADD_TO_CAMPAIGN' | 'DELETE') => {
    if (selectedIds.length === 0) return;
    if (action === 'ADD_TO_CAMPAIGN' && !bulkCampaignId) {
      toast.error('Select a target campaign first.');
      return;
    }
    try {
      await apiFetch('/api/companies/bulk', {
        method: 'POST',
        body: JSON.stringify({
          companyIds: selectedIds,
          action,
          campaignId: bulkCampaignId ? Number(bulkCampaignId) : undefined,
        }),
      });
      toast.success(`Bulk action (${action.toLowerCase()}) applied to ${selectedIds.length} company record(s).`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk action failed');
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/companies/merge', {
        method: 'POST',
        body: JSON.stringify({
          sourceCompanyId: Number(mergeSourceId),
          targetCompanyId: Number(mergeTargetId),
        }),
      });
      toast.success(`Merged duplicate into ${res.company.name}.`);
      setMergeOpen(false);
      setMergeSourceId('');
      setMergeTargetId('');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Merge failed');
    }
  };

  const handleSaveView = async () => {
    if (!newViewName.trim()) {
      toast.error('Enter a view name first.');
      return;
    }
    try {
      await apiFetch('/api/saved-views', {
        method: 'POST',
        body: JSON.stringify({
          page: 'companies',
          name: newViewName.trim(),
          filters: { search, validation, includeArchived: String(includeArchived) },
        }),
      });
      setNewViewName('');
      toast.success('Filter view saved.');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save view');
    }
  };

  const totalPages = Math.max(1, Math.ceil(companies.length / pageSize));
  const paged = companies.slice((page - 1) * pageSize, page * pageSize);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Centralized Company Database
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Deduplicated master company directory with inline editing, duplicate merging, bulk actions, and saved filter views.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const params = new URLSearchParams();
              if (search) params.set('search', search);
              if (validation) params.set('validation', validation);
              if (includeArchived) params.set('includeArchived', 'true');
              try {
                await apiDownloadCsv(`/api/companies/export?${params.toString()}`, `cadenceops_companies_${new Date().toISOString().slice(0, 10)}.csv`);
                toast.success('Companies CSV exported.');
              } catch {
                toast.error('Failed to export companies CSV');
              }
            }}
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </Button>
          {canMergeOrDelete && (
            <Button variant="outline" onClick={() => setMergeOpen(true)}>
              <GitMerge className="h-4 w-4" />
              <span>Merge Duplicates</span>
            </Button>
          )}
          {canMergeOrDelete && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              <span>Add Company</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filters & Saved Views */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
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
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 px-2 cursor-pointer">
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
              <span>Include Archived</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 inline-flex items-center gap-1"><Bookmark className="h-3.5 w-3.5" /> Saved Views:</span>
              {savedViews.length === 0 ? (
                <span className="text-slate-400">None saved</span>
              ) : (
                savedViews.map((v) => (
                  <span key={v.id} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <button
                      type="button"
                      className="hover:underline cursor-pointer"
                      onClick={() => {
                        setSearch(v.filters?.search || '');
                        setValidation(v.filters?.validation || '');
                        setIncludeArchived(v.filters?.includeArchived === 'true');
                      }}
                    >
                      {v.name}
                    </button>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600 cursor-pointer ml-1"
                      onClick={async () => {
                        await apiFetch(`/api/saved-views/${v.id}`, { method: 'DELETE' });
                        await load();
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-44 text-xs"
                placeholder="Save current filter as..."
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={handleSaveView}>Save View</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {isManager && selectedIds.length > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
              {selectedIds.length} company record(s) selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <SelectField className="h-8 w-48 text-xs" value={bulkCampaignId} onChange={(e) => setBulkCampaignId(e.target.value)}>
                <option value="">Enroll in campaign...</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('ADD_TO_CAMPAIGN')}>Add to Campaign</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction(includeArchived ? 'UNARCHIVE' : 'ARCHIVE')}>
                <Archive className="h-3.5 w-3.5" /> {includeArchived ? 'Unarchive' : 'Archive'}
              </Button>
              {canMergeOrDelete && (
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleBulkAction('DELETE')}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                {isManager && (
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={paged.length > 0 && paged.every((c) => selectedIds.includes(c.id))}
                      onChange={(e) => setSelectedIds(e.target.checked ? paged.map((c) => c.id) : [])}
                    />
                  </th>
                )}
                <th className="py-3 px-4 font-medium">Company</th>
                <th className="py-3 px-4 font-medium">Industry &amp; Size</th>
                <th className="py-3 px-4 font-medium">Country</th>
                <th className="py-3 px-4 font-medium text-right">Contacts</th>
                <th className="py-3 px-4 font-medium text-right">Campaigns</th>
                <th className="py-3 px-4 font-medium text-right">AI / Fit</th>
                <th className="py-3 px-4 font-medium">Validation</th>
                <th className="py-3 px-4 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400">Loading companies...</td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-slate-500">No companies found.</td></tr>
              ) : (
                paged.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => openCompany(c.id)}
                  >
                    {isManager && (
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
                        {c.isArchived && <span className="px-1.5 py-0.5 text-[10px] rounded border border-slate-300 text-slate-500">Archived</span>}
                      </div>
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
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => setEditCompany({ ...c })}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
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
          <DialogHeader><DialogTitle>Add Company (Duplicate &amp; DNC Checked)</DialogTitle></DialogHeader>
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
            {customFieldKeys.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                {customFieldKeys.map((fieldKey) => (
                  <div key={fieldKey}>
                    <Label>{fieldKey}</Label>
                    <Input
                      value={form.customFields?.[fieldKey] || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          customFields: { ...(form.customFields || {}), [fieldKey]: e.target.value },
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Save Company</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Company Modal */}
      <Dialog open={Boolean(editCompany)} onOpenChange={(o) => !o && setEditCompany(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Company — {editCompany?.name}</DialogTitle></DialogHeader>
          {editCompany && (
            <form onSubmit={handleEditSave} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Company Name *</Label><Input value={editCompany.name || ''} onChange={(e) => setEditCompany({ ...editCompany, name: e.target.value })} required /></div>
                <div><Label>Website</Label><Input value={editCompany.website || ''} onChange={(e) => setEditCompany({ ...editCompany, website: e.target.value })} /></div>
                <div><Label>Domain</Label><Input value={editCompany.domain || ''} onChange={(e) => setEditCompany({ ...editCompany, domain: e.target.value })} /></div>
                <div><Label>Industry</Label><Input value={editCompany.industry || ''} onChange={(e) => setEditCompany({ ...editCompany, industry: e.target.value })} /></div>
                <div><Label>Employee Size</Label><Input value={editCompany.employeeSize || ''} onChange={(e) => setEditCompany({ ...editCompany, employeeSize: e.target.value })} /></div>
                <div><Label>Country</Label><Input value={editCompany.country || ''} onChange={(e) => setEditCompany({ ...editCompany, country: e.target.value })} /></div>
                <div><Label>Revenue</Label><Input value={editCompany.revenue || ''} onChange={(e) => setEditCompany({ ...editCompany, revenue: e.target.value })} /></div>
                <div><Label>Timezone</Label><Input value={editCompany.timezone || ''} onChange={(e) => setEditCompany({ ...editCompany, timezone: e.target.value })} placeholder="America/New_York" /></div>
              </div>
              <div><Label>Description</Label><Textarea value={editCompany.description || ''} onChange={(e) => setEditCompany({ ...editCompany, description: e.target.value })} /></div>
              {customFieldKeys.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {customFieldKeys.map((fieldKey) => (
                    <div key={fieldKey}>
                      <Label>{fieldKey}</Label>
                      <Input
                        value={(editCompany.customFields as Record<string, string> | undefined)?.[fieldKey] || ''}
                        onChange={(e) =>
                          setEditCompany({
                            ...editCompany,
                            customFields: {
                              ...((editCompany.customFields as Record<string, string>) || {}),
                              [fieldKey]: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditCompany(null)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Duplicates Modal */}
      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge Duplicate Companies</DialogTitle></DialogHeader>
          <form onSubmit={handleMerge} className="space-y-3 mt-2">
            <p className="text-xs text-slate-500">
              All contacts, campaign records, activities, follow-ups, and appointments from the Source duplicate are safely moved to the Target master company, and the Source record is removed.
            </p>
            <div>
              <Label>Duplicate Source Company (will be removed) *</Label>
              <SelectField value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)} required>
                <option value="">Select source duplicate...</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.domain || 'no domain'})</option>)}
              </SelectField>
            </div>
            <div>
              <Label>Master Target Company (will be kept) *</Label>
              <SelectField value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} required>
                <option value="">Select master company...</option>
                {companies.filter((c) => String(c.id) !== mergeSourceId).map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.domain || 'no domain'})</option>
                ))}
              </SelectField>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
              <Button type="submit">Merge Companies</Button>
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

                {detail.company.customFields && Object.keys(detail.company.customFields).length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-xs">
                    {Object.entries(detail.company.customFields).map(([k, v]) => (
                      <div key={k}>
                        <div className="text-slate-400">{k}</div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">{String(v || '—')}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Associated Campaigns &amp; Representatives</h4>
                  {detail.campaignHistory.length === 0 ? (
                    <p className="text-xs text-slate-500">Not enrolled in any campaigns yet.</p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
                      {detail.campaignHistory.map((h: any) => (
                        <div key={h.id} className="px-3 py-2 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">{h.campaignName}</span>
                              <span className="text-slate-500 ml-2">Rep: {h.assignedToName || 'Unassigned'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {h.prospectSentiment && (
                                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getSentimentStyle(h.prospectSentiment)}`}>
                                  {h.prospectSentiment}
                                </span>
                              )}
                              <StatusLabel status={h.status} />
                            </div>
                          </div>
                          {h.prospectSummary && (
                            <div className="text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 px-2 py-1 rounded border border-slate-100 dark:border-slate-800">
                              <span className="font-semibold">Account Brief:</span> {h.prospectSummary}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">
                    Sales Rep Remarks &amp; Account Notes ({(detail.remarks || []).length})
                  </h4>
                  {(detail.remarks || []).length === 0 ? (
                    <p className="text-xs text-slate-500">No sales rep remarks added yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(detail.remarks || []).map((rm: any) => (
                        <div key={rm.id} className="text-xs p-2.5 rounded border border-slate-200 dark:border-slate-800 space-y-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              {rm.isPinned && (
                                <span className="px-1.5 py-0.5 rounded border border-amber-300 bg-amber-100 text-amber-900 text-[10px] font-semibold">
                                  PINNED
                                </span>
                              )}
                              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getRemarkCategoryStyle(rm.category)}`}>
                                {getRemarkCategoryLabel(rm.category)}
                              </span>
                              <span className="text-slate-500">{rm.campaignName}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-400">
                              {rm.authorName} · {new Date(rm.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-line">{rm.content}</p>
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
