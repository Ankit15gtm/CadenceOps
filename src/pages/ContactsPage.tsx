import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Download, Edit3, GitMerge, Plus, Search, ShieldBan, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiDownloadCsv, apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function ContactsPage() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [editContact, setEditContact] = useState<any>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');

  const [form, setForm] = useState({
    companyId: '',
    firstName: '',
    lastName: '',
    jobTitle: '',
    department: '',
    seniority: 'VP',
    workEmail: '',
    phone: '',
    linkedinUrl: '',
  });

  const isManager = user?.role !== 'SALES_REP';
  const canMergeOrDelete = user?.role === 'SUPER_ADMIN' || user?.role === 'DATA_MANAGER';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRes, cmpRes] = await Promise.all([
        apiFetch(`/api/contacts?search=${encodeURIComponent(search)}`),
        apiFetch('/api/companies'),
      ]);
      setContacts(ctRes.contacts);
      setCompanies(cmpRes.companies);
      setSelectedIds([]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ ...form, companyId: Number(form.companyId) }),
      });
      toast.success('Contact added');
      setAddOpen(false);
      setForm({ companyId: '', firstName: '', lastName: '', jobTitle: '', department: '', seniority: 'VP', workEmail: '', phone: '', linkedinUrl: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create contact');
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContact) return;
    try {
      await apiFetch(`/api/contacts/${editContact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editContact),
      });
      toast.success('Contact updated.');
      setEditContact(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update contact');
    }
  };

  const handleBulkAction = async (action: 'ARCHIVE' | 'MARK_DNC' | 'DELETE') => {
    if (selectedIds.length === 0) return;
    try {
      await apiFetch('/api/contacts/bulk', {
        method: 'POST',
        body: JSON.stringify({ contactIds: selectedIds, action }),
      });
      toast.success(`Applied ${action.toLowerCase()} to ${selectedIds.length} contact(s).`);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Bulk action failed');
    }
  };

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/contacts/merge', {
        method: 'POST',
        body: JSON.stringify({
          sourceContactId: Number(mergeSourceId),
          targetContactId: Number(mergeTargetId),
        }),
      });
      toast.success(`Merged contact into ${res.contact.fullName}.`);
      setMergeOpen(false);
      setMergeSourceId('');
      setMergeTargetId('');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to merge contacts');
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Centralized Contact Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Deduplicated prospect contacts with inline editing, duplicate merging, and bulk DNC suppression.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const params = new URLSearchParams();
              if (search) params.set('search', search);
              try {
                await apiDownloadCsv(`/api/contacts/export?${params.toString()}`, `cadenceops_contacts_${new Date().toISOString().slice(0, 10)}.csv`);
                toast.success('Contacts CSV exported.');
              } catch {
                toast.error('Failed to export contacts CSV');
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
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Add Contact</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              className="pl-9"
              placeholder="Search contacts by name, email, job title, or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isManager && selectedIds.length > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
              {selectedIds.length} contact(s) selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('MARK_DNC')}>
                <ShieldBan className="h-3.5 w-3.5" /> Mark Global DNC
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction('ARCHIVE')}>
                <Archive className="h-3.5 w-3.5" /> Archive
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
                      checked={contacts.length > 0 && selectedIds.length === contacts.length}
                      onChange={(e) => setSelectedIds(e.target.checked ? contacts.map((c) => c.id) : [])}
                    />
                  </th>
                )}
                <th className="py-3 px-4 font-medium">Contact Name</th>
                <th className="py-3 px-4 font-medium">Company</th>
                <th className="py-3 px-4 font-medium">Job Title</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Phone</th>
                <th className="py-3 px-4 font-medium">Validation</th>
                <th className="py-3 px-4 font-medium text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">Loading contacts...</td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-500">No contacts found.</td></tr>
              ) : (
                contacts.map((ct) => (
                  <tr key={ct.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    {isManager && (
                      <td className="py-3 px-4">
                        <input type="checkbox" checked={selectedIds.includes(ct.id)} onChange={() => toggleSelect(ct.id)} />
                      </td>
                    )}
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <span>{ct.fullName}</span>
                        {ct.doNotContact && (
                          <span className="px-1.5 py-0.5 rounded border border-red-300 bg-red-50 text-red-700 text-[10px] font-semibold">
                            DNC
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{ct.companyName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{ct.jobTitle || '—'}</td>
                    <td className="py-3 px-4 text-xs font-mono">{ct.workEmail || '—'}</td>
                    <td className="py-3 px-4 text-xs font-mono">{ct.phone || '—'}</td>
                    <td className="py-3 px-4"><StatusLabel status={ct.validationStatus} /></td>
                    <td className="py-3 px-4 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditContact({ ...ct })}>
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3 mt-2">
            <div>
              <Label>Company *</Label>
              <SelectField value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })} required>
                <option value="">Select a company...</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.domain || 'no domain'})</option>)}
              </SelectField>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>First Name *</Label><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
              <div><Label>Last Name *</Label><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
              <div><Label>Job Title</Label><Input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
              <div><Label>Seniority</Label><Input value={form.seniority} onChange={(e) => setForm({ ...form, seniority: e.target.value })} /></div>
              <div><Label>Work Email</Label><Input type="email" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div><Label>LinkedIn Profile URL</Label><Input value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit">Save Contact</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editContact)} onOpenChange={(o) => !o && setEditContact(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Contact — {editContact?.fullName}</DialogTitle></DialogHeader>
          {editContact && (
            <form onSubmit={handleEditSave} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Full Name *</Label><Input value={editContact.fullName || ''} onChange={(e) => setEditContact({ ...editContact, fullName: e.target.value })} required /></div>
                <div><Label>Job Title</Label><Input value={editContact.jobTitle || ''} onChange={(e) => setEditContact({ ...editContact, jobTitle: e.target.value })} /></div>
                <div><Label>Work Email</Label><Input type="email" value={editContact.workEmail || ''} onChange={(e) => setEditContact({ ...editContact, workEmail: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={editContact.phone || ''} onChange={(e) => setEditContact({ ...editContact, phone: e.target.value })} /></div>
                <div><Label>Department</Label><Input value={editContact.department || ''} onChange={(e) => setEditContact({ ...editContact, department: e.target.value })} /></div>
                <div><Label>Seniority</Label><Input value={editContact.seniority || ''} onChange={(e) => setEditContact({ ...editContact, seniority: e.target.value })} /></div>
              </div>
              <div><Label>LinkedIn URL</Label><Input value={editContact.linkedinUrl || ''} onChange={(e) => setEditContact({ ...editContact, linkedinUrl: e.target.value })} /></div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editContact.doNotContact)}
                  onChange={(e) => setEditContact({ ...editContact, doNotContact: e.target.checked })}
                />
                <span>Do Not Contact</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditContact(null)}>Cancel</Button>
                <Button type="submit">Save Contact</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Merge Duplicate Contacts</DialogTitle></DialogHeader>
          <form onSubmit={handleMerge} className="space-y-3 mt-2">
            <p className="text-xs text-slate-500">
              All outreach activities, follow-ups, and appointments from the Source contact are transferred to the Target contact before removing the duplicate.
            </p>
            <div>
              <Label>Duplicate Source Contact (will be removed) *</Label>
              <SelectField value={mergeSourceId} onChange={(e) => setMergeSourceId(e.target.value)} required>
                <option value="">Select duplicate contact...</option>
                {contacts.map((ct) => <option key={ct.id} value={ct.id}>{ct.fullName} ({ct.workEmail || ct.companyName})</option>)}
              </SelectField>
            </div>
            <div>
              <Label>Master Target Contact (will be kept) *</Label>
              <SelectField value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} required>
                <option value="">Select master contact...</option>
                {contacts.filter((ct) => String(ct.id) !== mergeSourceId).map((ct) => (
                  <option key={ct.id} value={ct.id}>{ct.fullName} ({ct.workEmail || ct.companyName})</option>
                ))}
              </SelectField>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMergeOpen(false)}>Cancel</Button>
              <Button type="submit">Merge Contacts</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
