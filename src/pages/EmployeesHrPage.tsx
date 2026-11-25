import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatRoleLabel } from '../lib/utils.ts';
import { Card, CardContent } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

export function EmployeesPage() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<any>(null);
  const [resetEmp, setResetEmp] = useState<any>(null);
  const [generatedToken, setGeneratedToken] = useState<{ name: string; token: string } | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    department: 'Sales',
    jobRole: 'Sales Representative',
    role: 'SALES_REP',
    joiningDate: new Date().toISOString().slice(0, 10),
    reportingManagerId: '',
    initialPassword: '',
  });
  const [resetPasswordInput, setResetPasswordInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/employees');
      setEmployees(res.employees);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/employees', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      toast.success(`Employee account created for ${res.employee.fullName}`);
      setCreateOpen(false);
      if (res.inviteToken) {
        setGeneratedToken({ name: res.employee.fullName, token: res.inviteToken });
      }
      setForm({
        fullName: '',
        email: '',
        phone: '',
        department: 'Sales',
        jobRole: 'Sales Representative',
        role: 'SALES_REP',
        joiningDate: new Date().toISOString().slice(0, 10),
        reportingManagerId: '',
        initialPassword: '',
      });
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create employee');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editEmp) return;
    try {
      await apiFetch(`/api/employees/${editEmp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName: editEmp.fullName,
          phone: editEmp.phone,
          department: editEmp.department,
          jobRole: editEmp.jobRole,
          role: editEmp.role,
          reportingManagerId: editEmp.reportingManagerId || null,
        }),
      });
      if (editEmp.role === 'SALES_REP') {
        await apiFetch(`/api/employees/${editEmp.id}/targets`, {
          method: 'PATCH',
          body: JSON.stringify({
            dailyCallTarget: Number(editEmp.dailyCallTarget || 35),
            dailyOutreachTarget: Number(editEmp.dailyOutreachTarget || 60),
          }),
        });
      }
      toast.success('Employee profile updated.');
      setEditEmp(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update employee');
    }
  };

  const toggleActive = async (emp: any) => {
    try {
      await apiFetch(`/api/employees/${emp.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !emp.isActive }),
      });
      toast.success(emp.isActive ? 'Employee deactivated' : 'Employee activated');
      await load();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmp) return;
    try {
      const res = await apiFetch(`/api/employees/${resetEmp.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPasswordInput.trim() || undefined }),
      });
      setResetEmp(null);
      setResetPasswordInput('');
      if (res.resetToken) {
        setGeneratedToken({ name: resetEmp.fullName, token: res.resetToken });
      } else {
        toast.success('Temporary password updated.');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Password reset failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            HR &amp; Employee Directory
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Provision role-based employee accounts, assign reporting managers, activate/deactivate access, and issue secure invite tokens.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          <span>Add Employee</span>
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Employee</th>
                <th className="py-3 px-4 font-medium">Role &amp; Dept</th>
                <th className="py-3 px-4 font-medium">Reporting To</th>
                <th className="py-3 px-4 font-medium">Joined</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-400">Loading directory...</td></tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="py-3 px-4">
                      <div className="font-medium">{emp.fullName}</div>
                      <div className="text-xs text-slate-500 font-mono">{emp.employeeCode} · {emp.email}</div>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div className="font-medium">{formatRoleLabel(emp.role)}</div>
                      <div className="text-slate-500">{emp.jobRole} · {emp.department}</div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{emp.reportingManagerName || '—'}</td>
                    <td className="py-3 px-4 text-xs font-mono tabular-nums">{emp.joiningDate}</td>
                    <td className="py-3 px-4">
                      <StatusLabel status={emp.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </td>
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <Button size="sm" variant="outline" onClick={() => setEditEmp({ ...emp })}>Edit</Button>
                      <Button size="sm" variant="outline" onClick={() => setResetEmp(emp)}>
                        <KeyRound className="h-3.5 w-3.5" /> Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={emp.id === user?.id}
                        onClick={() => toggleActive(emp)}
                      >
                        {emp.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Employee */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Employee Account</DialogTitle></DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Full Name *</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
              <div><Label>Work Email *</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Joining Date</Label><Input type="date" value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} /></div>
              <div>
                <Label>System Role *</Label>
                <SelectField value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="SALES_REP">Sales Representative / Prospecting Executive</option>
                  <option value="DATA_MANAGER">Data Manager</option>
                  <option value="CAMPAIGN_MANAGER">Campaign Manager</option>
                  <option value="HR_MANAGER">HR Manager</option>
                  {user?.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                </SelectField>
              </div>
              <div><Label>Department</Label><Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              <div><Label>Job Title</Label><Input value={form.jobRole} onChange={(e) => setForm({ ...form, jobRole: e.target.value })} /></div>
              <div>
                <Label>Reporting Manager</Label>
                <SelectField value={form.reportingManagerId} onChange={(e) => setForm({ ...form, reportingManagerId: e.target.value })}>
                  <option value="">None</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                </SelectField>
              </div>
            </div>
            <div>
              <Label>Initial Password (leave blank to generate secure 72h invite token)</Label>
              <Input
                type="password"
                minLength={8}
                value={form.initialPassword}
                onChange={(e) => setForm({ ...form, initialPassword: e.target.value })}
                placeholder="Optional (min 8 chars)"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit">Create Account</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Employee */}
      <Dialog open={Boolean(editEmp)} onOpenChange={(o) => !o && setEditEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Employee — {editEmp?.fullName}</DialogTitle></DialogHeader>
          {editEmp && (
            <form onSubmit={handleEdit} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Full Name</Label><Input value={editEmp.fullName} onChange={(e) => setEditEmp({ ...editEmp, fullName: e.target.value })} required /></div>
                <div><Label>Phone</Label><Input value={editEmp.phone || ''} onChange={(e) => setEditEmp({ ...editEmp, phone: e.target.value })} /></div>
                <div><Label>Department</Label><Input value={editEmp.department} onChange={(e) => setEditEmp({ ...editEmp, department: e.target.value })} /></div>
                <div><Label>Job Title</Label><Input value={editEmp.jobRole} onChange={(e) => setEditEmp({ ...editEmp, jobRole: e.target.value })} /></div>
                <div>
                  <Label>System Role</Label>
                  <SelectField value={editEmp.role} onChange={(e) => setEditEmp({ ...editEmp, role: e.target.value })}>
                    <option value="SALES_REP">Sales Representative</option>
                    <option value="DATA_MANAGER">Data Manager</option>
                    <option value="CAMPAIGN_MANAGER">Campaign Manager</option>
                    <option value="HR_MANAGER">HR Manager</option>
                    {user?.role === 'SUPER_ADMIN' && <option value="SUPER_ADMIN">Super Admin</option>}
                  </SelectField>
                </div>
                <div>
                  <Label>Reporting Manager</Label>
                  <SelectField value={editEmp.reportingManagerId || ''} onChange={(e) => setEditEmp({ ...editEmp, reportingManagerId: e.target.value })}>
                    <option value="">None</option>
                    {employees.filter((e) => e.id !== editEmp.id).map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                  </SelectField>
                </div>
                {editEmp.role === 'SALES_REP' && (
                  <>
                    <div>
                      <Label>Daily Call Target</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editEmp.dailyCallTarget ?? 35}
                        onChange={(e) => setEditEmp({ ...editEmp, dailyCallTarget: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Daily Outreach Target</Label>
                      <Input
                        type="number"
                        min={1}
                        value={editEmp.dailyOutreachTarget ?? 60}
                        onChange={(e) => setEditEmp({ ...editEmp, dailyOutreachTarget: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditEmp(null)}>Cancel</Button>
                <Button type="submit">Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password */}
      <Dialog open={Boolean(resetEmp)} onOpenChange={(o) => !o && setResetEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset Password — {resetEmp?.fullName}</DialogTitle></DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-3 mt-2">
            <p className="text-xs text-slate-500">
              Leave blank to generate a one-time setup token (recommended), or enter a temporary password (min 8 chars).
            </p>
            <div>
              <Label>Temporary Password (optional)</Label>
              <Input
                type="password"
                minLength={8}
                value={resetPasswordInput}
                onChange={(e) => setResetPasswordInput(e.target.value)}
                placeholder="Leave blank to generate one-time token"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setResetEmp(null)}>Cancel</Button>
              <Button type="submit">Generate / Reset</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* One-Time Token Modal */}
      <Dialog open={Boolean(generatedToken)} onOpenChange={(o) => !o && setGeneratedToken(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>One-Time Invite / Reset Token — {generatedToken?.name}</DialogTitle></DialogHeader>
          {generatedToken && (
            <div className="space-y-3 mt-2 text-sm">
              <p className="text-xs text-slate-500">
                Share this token securely with the employee. They can activate their password under the &quot;Invite Token&quot; tab on the sign-in screen. It is shown only once.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs break-all">
                <span className="flex-1">{generatedToken.token}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedToken.token);
                    toast.success('Token copied to clipboard');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setGeneratedToken(null)}>Done</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function LeaveRequestsPage() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [reps, setReps] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ leaveType: 'Annual', startDate: '', endDate: '', reason: '' });
  const [reassignLeave, setReassignLeave] = useState<any>(null);
  const [coverRepId, setCoverRepId] = useState('');
  const [includeQueueRecords, setIncludeQueueRecords] = useState(true);
  const canApprove = user?.role === 'SUPER_ADMIN' || user?.role === 'HR_MANAGER' || user?.role === 'CAMPAIGN_MANAGER';

  const load = useCallback(async () => {
    const [lvRes, empRes] = await Promise.all([apiFetch('/api/hr/leaves'), apiFetch('/api/employees').catch(() => ({ employees: [] }))]);
    setLeaves(lvRes.leaves);
    setReps((empRes.employees || []).filter((e: any) => e.role === 'SALES_REP' && e.isActive));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/hr/leaves', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Leave request submitted.');
    setOpen(false);
    setForm({ leaveType: 'Annual', startDate: '', endDate: '', reason: '' });
    await load();
  };

  const decide = async (id: number, status: string) => {
    const res = await apiFetch(`/api/hr/leaves/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (status === 'APPROVED' && (res.impactedFollowUps > 0 || res.unworkedAssigned > 0)) {
      toast.warning(
        `Leave approved. Coverage alert: ${res.impactedFollowUps} follow-up(s) in window and ${res.unworkedAssigned} unworked queue record(s).`
      );
    } else {
      toast.success(`Leave ${status.toLowerCase()}`);
    }
    await load();
  };

  const handleReassignCoverage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignLeave || !coverRepId) return;
    try {
      const res = await apiFetch(`/api/hr/leaves/${reassignLeave.id}/reassign-work`, {
        method: 'POST',
        body: JSON.stringify({ coverRepId: Number(coverRepId), includeQueueRecords }),
      });
      toast.success(`Reassigned ${res.reassignedFollowUps} follow-up(s) and ${res.reassignedQueue} queue record(s) for coverage.`);
      setReassignLeave(null);
      setCoverRepId('');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reassign leave coverage');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">Leave Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Submit and review team leave requests.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Request Leave</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Employee</th>
                <th className="py-3 px-4 font-medium">Type</th>
                <th className="py-3 px-4 font-medium">Dates</th>
                <th className="py-3 px-4 font-medium">Reason</th>
                <th className="py-3 px-4 font-medium">Status</th>
                {canApprove && <th className="py-3 px-4 font-medium text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td className="py-3 px-4 font-medium">{l.employeeName}</td>
                  <td className="py-3 px-4 text-xs">{l.leaveType}</td>
                  <td className="py-3 px-4 font-mono text-xs tabular-nums">{l.startDate} to {l.endDate}</td>
                  <td className="py-3 px-4 text-xs text-slate-500">{l.reason || '—'}</td>
                  <td className="py-3 px-4"><StatusLabel status={l.status} /></td>
                  {canApprove && (
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      {l.status === 'PENDING' && (user?.role === 'SUPER_ADMIN' || user?.role === 'HR_MANAGER') && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => decide(l.id, 'APPROVED')}>Approve</Button>
                          <Button size="sm" variant="outline" onClick={() => decide(l.id, 'REJECTED')}>Reject</Button>
                        </>
                      )}
                      {l.status === 'APPROVED' && (
                        <Button size="sm" variant="outline" onClick={() => setReassignLeave(l)}>
                          Reassign Coverage
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Leave</DialogTitle></DialogHeader>
          <form onSubmit={submitLeave} className="space-y-3 mt-2">
            <div>
              <Label>Leave Type</Label>
              <SelectField value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
                <option value="Annual">Annual</option>
                <option value="Sick">Sick</option>
                <option value="Personal">Personal</option>
                <option value="Unpaid">Unpaid</option>
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Start Date *</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required /></div>
              <div><Label>End Date *</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required /></div>
            </div>
            <div><Label>Reason</Label><Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">Submit Request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(reassignLeave)} onOpenChange={(o) => !o && setReassignLeave(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign Leave Coverage — {reassignLeave?.employeeName}</DialogTitle></DialogHeader>
          {reassignLeave && (
            <form onSubmit={handleReassignCoverage} className="space-y-3 mt-2">
              <p className="text-xs text-slate-500">
                Transfer pending follow-ups scheduled between {reassignLeave.startDate} and {reassignLeave.endDate} to another active Sales Rep.
              </p>
              <div>
                <Label>Covering Sales Representative *</Label>
                <SelectField value={coverRepId} onChange={(e) => setCoverRepId(e.target.value)} required>
                  <option value="">Select covering rep...</option>
                  {reps.filter((r) => r.id !== reassignLeave.userId).map((r) => (
                    <option key={r.id} value={r.id}>{r.fullName}</option>
                  ))}
                </SelectField>
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeQueueRecords}
                  onChange={(e) => setIncludeQueueRecords(e.target.checked)}
                />
                <span>Also reassign unworked (&quot;Not Yet Worked&quot;) queue records</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setReassignLeave(null)}>Cancel</Button>
                <Button type="submit">Transfer Coverage</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
