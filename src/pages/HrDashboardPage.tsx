import React, { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { formatRoleLabel } from '../lib/utils.ts';
import type { NavRoute } from '../components/AppShell.tsx';

export function HrDashboardPage({ onNavigate }: { onNavigate: (route: NavRoute) => void }) {
  const [data, setData] = useState<{
    summary: {
      totalEmployees: number;
      activeEmployees: number;
      inactiveEmployees: number;
      salesReps: number;
      dataManagers: number;
      pendingLeaves: number;
    };
    departmentBreakdown: Array<{ department: string; count: number }>;
    roleBreakdown: Array<{ role: string; count: number }>;
  } | null>(null);

  useEffect(() => {
    apiFetch('/api/dashboard/hr').then(setData).catch(() => {});
  }, []);

  if (!data) {
    return <div className="h-40 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
            HR &amp; Workforce Overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Manage employee accounts, role permissions, password resets, and leave approvals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => onNavigate('leaves')}>
            Leave Requests ({data.summary.pendingLeaves})
          </Button>
          <Button onClick={() => onNavigate('employees')}>
            <span>Manage Employees</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Employees', value: data.summary.totalEmployees },
          { label: 'Active Accounts', value: data.summary.activeEmployees },
          { label: 'Deactivated', value: data.summary.inactiveEmployees },
          { label: 'Sales Representatives', value: data.summary.salesReps },
          { label: 'Data Managers', value: data.summary.dataManagers },
          { label: 'Pending Leave Requests', value: data.summary.pendingLeaves },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{k.label}</div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Headcount by Department</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
            {data.departmentBreakdown.map((d) => (
              <div key={d.department} className="px-5 py-3 flex items-center justify-between text-sm">
                <span>{d.department}</span>
                <span className="font-mono font-semibold tabular-nums">{d.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Access Roles Distribution</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
            {data.roleBreakdown.map((r) => (
              <div key={r.role} className="px-5 py-3 flex items-center justify-between text-sm">
                <span>{formatRoleLabel(r.role)}</span>
                <span className="font-mono font-semibold tabular-nums">{r.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
