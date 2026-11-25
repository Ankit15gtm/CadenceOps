import React, { useCallback, useEffect, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatRoleLabel } from '../lib/utils.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField } from '../components/ui/form.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';
import type { NavRoute } from '../components/AppShell.tsx';

export function NotificationsPage({ onNavigate }: { onNavigate: (route: NavRoute) => void }) {
  const { refreshProfile } = useAuth();
  const [items, setItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/notifications');
    setItems(res.notifications);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await Promise.all([load(), refreshProfile()]);
    toast.success('All notifications marked read.');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold">Notifications</h1>
          <p className="text-sm text-slate-500">Alerts for assigned data, due follow-ups, appointments, and data requests.</p>
        </div>
        <Button variant="outline" size="sm" onClick={markAll}>
          <Check className="h-3.5 w-3.5" /> Mark All Read
        </Button>
      </div>

      <Card>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">No notifications yet.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={async () => {
                  if (!n.isRead) {
                    await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
                    await refreshProfile();
                  }
                  if (n.linkPath?.includes('follow-ups')) onNavigate('follow-ups');
                  else if (n.linkPath?.includes('appointments')) onNavigate('appointments');
                  else if (n.linkPath?.includes('data-requests')) onNavigate('data-requests');
                  else if (n.linkPath?.includes('workspace')) onNavigate('workspace');
                  else load();
                }}
                className={`p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-start justify-between gap-4 ${
                  !n.isRead ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                }`}
              >
                <div>
                  <div className="text-sm font-semibold">{n.title}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</div>
                </div>
                <div className="text-xs font-mono text-slate-400 shrink-0">{n.createdAt.slice(0, 16).replace('T', ' ')}</div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('');

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (entity) params.set('entity', entity);
    const res = await apiFetch(`/api/audit-logs?${params.toString()}`);
    setLogs(res.auditLogs);
  }, [search, entity]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">System Audit Trail</h1>
        <p className="text-sm text-slate-500">Immutable operational audit log of imports, assignments, status changes, and user actions.</p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
            <Input className="pl-9" placeholder="Search by user, action, or entity..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <SelectField className="sm:w-52" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All Entities</option>
            <option value="import_batch">Import Batches</option>
            <option value="campaign">Campaigns</option>
            <option value="campaign_company_record">Prospect Records</option>
            <option value="appointment">Appointments</option>
            <option value="data_request">Data Requests</option>
            <option value="user">Employees &amp; Auth</option>
          </SelectField>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
              <tr>
                <th className="py-2.5 px-4 font-medium">Timestamp</th>
                <th className="py-2.5 px-4 font-medium">User</th>
                <th className="py-2.5 px-4 font-medium">Action</th>
                <th className="py-2.5 px-4 font-medium">Entity</th>
                <th className="py-2.5 px-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 px-4 font-mono tabular-nums whitespace-nowrap">{l.createdAt.slice(0, 19).replace('T', ' ')}</td>
                  <td className="py-2.5 px-4 font-medium">{l.userName || 'System'}</td>
                  <td className="py-2.5 px-4 font-mono">{l.action}</td>
                  <td className="py-2.5 px-4">{l.entity} #{l.entityId || '—'}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500 max-w-md truncate">
                    {l.newValue ? JSON.stringify(l.newValue) : '—'}
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

export function SettingsPage() {
  const { refreshProfile } = useAuth();
  const [statuses, setStatuses] = useState<any[]>([]);
  const [newCode, setNewCode] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newCat, setNewCat] = useState('IN_PROGRESS');
  const [dupPolicy, setDupPolicy] = useState({
    strictDomainDeduplication: true,
    strictEmailDeduplication: true,
    preventCrossRepSameCampaign: true,
    allowReuseAcrossDifferentCampaigns: true,
  });

  const load = useCallback(async () => {
    const [stRes, setRes] = await Promise.all([apiFetch('/api/statuses'), apiFetch('/api/settings')]);
    setStatuses(stRes.statuses);
    if (setRes.settings?.duplicate_policy) {
      setDupPolicy(setRes.settings.duplicate_policy);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/statuses', {
      method: 'POST',
      body: JSON.stringify({ code: newCode, label: newLabel, category: newCat }),
    });
    setNewCode('');
    setNewLabel('');
    toast.success('Prospect status added');
    await Promise.all([load(), refreshProfile()]);
  };

  const toggleStatus = async (st: any) => {
    await apiFetch(`/api/statuses/${st.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !st.isActive }),
    });
    await Promise.all([load(), refreshProfile()]);
  };

  const saveDupPolicy = async () => {
    await apiFetch('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify({ key: 'duplicate_policy', value: dupPolicy }),
    });
    toast.success('Duplicate prevention rules saved.');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold">Application Settings &amp; Statuses</h1>
        <p className="text-sm text-slate-500">Configure prospecting statuses, duplicate rules, and operational defaults.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Duplicate Prevention &amp; Distribution Rules</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { key: 'strictDomainDeduplication', label: 'Enforce strict normalized domain deduplication on company import' },
            { key: 'strictEmailDeduplication', label: 'Enforce strict email & LinkedIn URL deduplication on contact import' },
            { key: 'preventCrossRepSameCampaign', label: 'Block assigning the same company to multiple reps inside the same campaign' },
            { key: 'allowReuseAcrossDifferentCampaigns', label: 'Allow reusing centralized companies in separate campaigns' },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean((dupPolicy as any)[item.key])}
                onChange={(e) => setDupPolicy({ ...dupPolicy, [item.key]: e.target.checked })}
              />
              <span>{item.label}</span>
            </label>
          ))}
          <div className="pt-2">
            <Button size="sm" onClick={saveDupPolicy}>Save Policy</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Configurable Prospecting Statuses</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addStatus} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div><Label>Status Code</Label><Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="CALLBACK_SCHEDULED" required /></div>
            <div><Label>Display Label</Label><Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Callback Scheduled" required /></div>
            <div>
              <Label>Category</Label>
              <SelectField value={newCat} onChange={(e) => setNewCat(e.target.value)}>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="POSITIVE">Positive</option>
                <option value="CLOSED">Closed</option>
              </SelectField>
            </div>
            <Button type="submit"><Plus className="h-4 w-4" /> Add Status</Button>
          </form>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-md">
            {statuses.map((st) => (
              <div key={st.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <StatusLabel status={st.code} />
                  <span className="font-mono text-slate-500">{st.code}</span>
                  <span className="text-slate-400">({st.category})</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleStatus(st)}>
                  {st.isActive ? 'Disable' : 'Enable'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      toast.success('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold">My Employee Profile</h1>
        <p className="text-sm text-slate-500">Account details and password security.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>{user.fullName}</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><span className="text-slate-500">Employee ID:</span> <span className="font-mono">{user.employeeCode}</span></div>
          <div><span className="text-slate-500">Role:</span> {formatRoleLabel(user.role)}</div>
          <div><span className="text-slate-500">Email:</span> {user.email}</div>
          <div><span className="text-slate-500">Department:</span> {user.department}</div>
          <div><span className="text-slate-500">Job Role:</span> {user.jobRole}</div>
          <div><span className="text-slate-500">Joining Date:</span> <span className="font-mono">{user.joiningDate}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Set or Change Password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={updatePassword} className="space-y-3">
            <div>
              <Label>Current Password (leave blank if setting for the first time)</Label>
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <Label>New Password (min 8 characters) *</Label>
              <Input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <Button type="submit" disabled={busy}>{busy ? 'Updating...' : 'Update Password'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
