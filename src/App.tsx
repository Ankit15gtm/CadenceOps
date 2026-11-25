import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { AppShell, NavRoute } from './components/AppShell.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { AdminDashboardPage } from './pages/AdminDashboardPage.tsx';
import { RepDashboardPage } from './pages/RepDashboardPage.tsx';
import { HrDashboardPage } from './pages/HrDashboardPage.tsx';
import { CampaignsPage } from './pages/CampaignsPage.tsx';
import { CampaignDetailPage } from './pages/CampaignDetailPage.tsx';
import { CompaniesPage } from './pages/CompaniesPage.tsx';
import { ContactsPage } from './pages/ContactsPage.tsx';
import { DataImportsPage } from './pages/DataImportsPage.tsx';
import { DataDistributionPage } from './pages/DataDistributionPage.tsx';
import { ProspectingWorkspacePage } from './pages/ProspectingWorkspacePage.tsx';
import { ActivitiesPage } from './pages/ActivitiesPage.tsx';
import { FollowUpsPage } from './pages/FollowUpsPage.tsx';
import { AppointmentsPage } from './pages/AppointmentsPage.tsx';
import { DataRequestsPage } from './pages/DataRequestsPage.tsx';
import { EmployeesPage, LeaveRequestsPage } from './pages/EmployeesHrPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import {
  AuditLogsPage,
  NotificationsPage,
  ProfilePage,
  SettingsPage,
} from './pages/NotificationsAuditSettingsPage.tsx';

const BREADCRUMBS: Record<NavRoute, string> = {
  dashboard: 'Dashboard',
  campaigns: 'Campaigns',
  'campaign-detail': 'Campaigns / Campaign Details',
  companies: 'Companies Database',
  contacts: 'Contacts Directory',
  imports: 'Data Imports & Deduplication',
  distribution: 'Data Distribution',
  'data-requests': 'Data Requests',
  employees: 'HR & Employees',
  leaves: 'Leave Requests',
  workspace: 'Prospecting Queue',
  activities: 'Outreach Activities',
  'follow-ups': 'Follow-up Manager',
  appointments: 'Appointments',
  reports: 'Performance Reports',
  notifications: 'Notifications',
  'audit-logs': 'Audit Logs',
  settings: 'System Settings',
  profile: 'My Profile',
};

function MainRouter() {
  const { user, loading } = useAuth();
  const [route, setRoute] = useState<NavRoute>('dashboard');
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Loading CadenceOps workspace...
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const openCampaign = (id: number) => {
    setSelectedCampaignId(id);
    setRoute('campaign-detail');
  };

  const openProspectRecord = (recordId: number) => {
    setSelectedRecordId(recordId);
    setRoute('workspace');
  };

  const renderPage = () => {
    switch (route) {
      case 'dashboard':
        if (user.role === 'SALES_REP') return <RepDashboardPage onNavigate={setRoute} />;
        if (user.role === 'HR_MANAGER') return <HrDashboardPage onNavigate={setRoute} />;
        return <AdminDashboardPage />;
      case 'campaigns':
        return <CampaignsPage onOpenCampaign={openCampaign} />;
      case 'campaign-detail':
        return selectedCampaignId ? (
          <CampaignDetailPage
            campaignId={selectedCampaignId}
            onBack={() => setRoute('campaigns')}
            onOpenRecord={openProspectRecord}
          />
        ) : (
          <CampaignsPage onOpenCampaign={openCampaign} />
        );
      case 'companies':
        return <CompaniesPage />;
      case 'contacts':
        return <ContactsPage />;
      case 'imports':
        return <DataImportsPage />;
      case 'distribution':
        return <DataDistributionPage />;
      case 'workspace':
        return (
          <ProspectingWorkspacePage
            initialRecordId={selectedRecordId}
            onClearInitialRecord={() => setSelectedRecordId(null)}
          />
        );
      case 'activities':
        return <ActivitiesPage onOpenRecord={openProspectRecord} />;
      case 'follow-ups':
        return <FollowUpsPage onOpenRecord={openProspectRecord} />;
      case 'appointments':
        return <AppointmentsPage onOpenRecord={openProspectRecord} />;
      case 'data-requests':
        return <DataRequestsPage />;
      case 'employees':
        return <EmployeesPage />;
      case 'leaves':
        return <LeaveRequestsPage />;
      case 'reports':
        return <ReportsPage />;
      case 'notifications':
        return <NotificationsPage onNavigate={setRoute} />;
      case 'audit-logs':
        return <AuditLogsPage />;
      case 'settings':
        return <SettingsPage />;
      case 'profile':
        return <ProfilePage />;
      default:
        return <AdminDashboardPage />;
    }
  };

  return (
    <AppShell activeRoute={route} breadcrumb={BREADCRUMBS[route]} onNavigate={setRoute}>
      {renderPage()}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainRouter />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}
