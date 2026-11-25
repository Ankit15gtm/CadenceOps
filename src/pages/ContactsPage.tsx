import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRes, cmpRes] = await Promise.all([
        apiFetch(`/api/contacts?search=${encodeURIComponent(search)}`),
        apiFetch('/api/companies'),
      ]);
      setContacts(ctRes.contacts);
      setCompanies(cmpRes.companies);
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

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            Centralized Contact Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Deduplicated prospect contacts linked to master company accounts.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Add Contact</span>
        </Button>
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

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Contact Name</th>
                <th className="py-3 px-4 font-medium">Company</th>
                <th className="py-3 px-4 font-medium">Job Title</th>
                <th className="py-3 px-4 font-medium">Email</th>
                <th className="py-3 px-4 font-medium">Phone</th>
                <th className="py-3 px-4 font-medium">Validation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">Loading contacts...</td></tr>
              ) : contacts.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">No contacts found.</td></tr>
              ) : (
                contacts.map((ct) => (
                  <tr key={ct.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-medium">{ct.fullName}</td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{ct.companyName}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">{ct.jobTitle || '—'}</td>
                    <td className="py-3 px-4 text-xs font-mono">{ct.workEmail || '—'}</td>
                    <td className="py-3 px-4 text-xs font-mono">{ct.phone || '—'}</td>
                    <td className="py-3 px-4"><StatusLabel status={ct.validationStatus} /></td>
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
    </div>
  );
}
