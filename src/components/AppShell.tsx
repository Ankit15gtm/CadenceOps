import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Megaphone,
  Building2,
  Users,
  Upload,
  Share2,
  FilePlus2,
  UserCog,
  Briefcase,
  Activity,
  Clock,
  CalendarCheck2,
  BarChart3,
  Bell,
  ScrollText,
  Settings,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  UserCircle2,
  CalendarOff,
  GitBranch,
  ShieldBan,
  DollarSign,
  Search,
} from 'lucide-react';
import { useAuth, AppRole } from '../contexts/AuthContext.tsx';
import { cn, formatCurrency, formatRoleLabel } from '../lib/utils.ts';
import { apiFetch } from '../lib/api.ts';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Input } from './ui/form.tsx';
import { StatusLabel } from './StatusLabel.tsx';

export type NavRoute =
  | 'dashboard'
  | 'campaigns'
  | 'campaign-detail'
  | 'companies'
  | 'contacts'
  | 'imports'
  | 'distribution'
  | 'data-requests'
  | 'employees'
  | 'leaves'
  | 'workspace'
  | 'pipeline'
  | 'activities'
  | 'follow-ups'
  | 'appointments'
  | 'reports'
  | 'templates-sequences'
  | 'dnc-compliance'
  | 'notifications'
  | 'audit-logs'
  | 'settings'
  | 'profile';

interface NavItem {
  id: NavRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'HR_MANAGER', 'SALES_REP'] },
  { id: 'workspace', label: 'Prospecting Queue', icon: Briefcase, roles: ['SALES_REP', 'SUPER_ADMIN'] },
  { id: 'pipeline', label: 'Deal Pipeline', icon: DollarSign, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'SALES_REP'] },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'SALES_REP'] },
  { id: 'companies', label: 'Companies', icon: Building2, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'contacts', label: 'Contacts', icon: Users, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'imports', label: 'Data Imports', icon: Upload, roles: ['SUPER_ADMIN', 'DATA_MANAGER'] },
  { id: 'distribution', label: 'Data Distribution', icon: Share2, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'data-requests', label: 'Data Requests', icon: FilePlus2, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'SALES_REP'] },
  { id: 'activities', label: 'Activities', icon: Activity, roles: ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'SALES_REP'] },
  { id: 'follow-ups', label: 'Follow-ups', icon: Clock, roles: ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'SALES_REP'] },
  { id: 'appointments', label: 'Appointments', icon: CalendarCheck2, roles: ['SUPER_ADMIN', 'SALES_REP', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'templates-sequences', label: 'Templates & Cadences', icon: GitBranch, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'SALES_REP'] },
  { id: 'dnc-compliance', label: 'DNC & Compliance', icon: ShieldBan, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'employees', label: 'HR & Employees', icon: UserCog, roles: ['SUPER_ADMIN', 'HR_MANAGER'] },
  { id: 'leaves', label: 'Leave Requests', icon: CalendarOff, roles: ['SUPER_ADMIN', 'HR_MANAGER', 'SALES_REP', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'] },
  { id: 'notifications', label: 'Notifications', icon: Bell, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'HR_MANAGER', 'SALES_REP'] },
  { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText, roles: ['SUPER_ADMIN'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
  { id: 'profile', label: 'My Profile', icon: UserCircle2, roles: ['SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'HR_MANAGER', 'SALES_REP'] },
];

export function AppShell({
  activeRoute,
  breadcrumb,
  onNavigate,
  onOpenCampaign,
  onOpenProspectRecord,
  children,
}: {
  activeRoute: NavRoute;
  breadcrumb: string;
  onNavigate: (route: NavRoute) => void;
  onOpenCampaign?: (campaignId: number) => void;
  onOpenProspectRecord?: (recordId: number) => void;
  children: React.ReactNode;
}) {
  const { user, darkMode, toggleDarkMode, unreadNotifications, recentNotifications, logout, refreshProfile } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
        setSearchResults(res.results);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, searchOpen]);

  if (!user) return null;

  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    await refreshProfile();
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 shrink-0">
          <button
            onClick={() => {
              onNavigate('dashboard');
              setMobileOpen(false);
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            CadenceOps
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeRoute === item.id || (activeRoute === 'campaign-detail' && item.id === 'campaigns');
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setMobileOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/70 dark:hover:bg-slate-800/70'
                )}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'notifications' && unreadNotifications > 0 && (
                  <span className="font-mono text-xs tabular-nums text-blue-700 dark:text-blue-300 font-semibold">
                    {unreadNotifications}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
          <div className="px-2 py-1.5 mb-2">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.fullName}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {formatRoleLabel(user.role)} · {user.employeeCode}
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="font-medium text-slate-900 dark:text-slate-100">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="h-9 px-3 flex items-center gap-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Global quick search"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Quick search...</span>
              <span className="hidden md:inline font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                Ctrl+K
              </span>
            </button>

            <button
              onClick={toggleDarkMode}
              className="h-9 w-9 flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Toggle color theme"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="relative h-9 px-3 flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Open notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="font-mono tabular-nums text-blue-700 dark:text-blue-400 font-semibold">
                  {unreadNotifications}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-11 w-80 sm:w-96 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg z-50">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-sm font-semibold">Notifications</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={markAllRead}
                      className="text-xs text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Mark all read
                    </button>
                    <button
                      onClick={() => {
                        setNotifOpen(false);
                        onNavigate('notifications');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      View all
                    </button>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {recentNotifications.length === 0 ? (
                    <div className="p-4 text-xs text-slate-500 text-center">No notifications yet.</div>
                  ) : (
                    recentNotifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={async () => {
                          if (!n.isRead) {
                            await apiFetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
                            await refreshProfile();
                          }
                          setNotifOpen(false);
                          if (n.linkPath?.includes('follow-ups')) onNavigate('follow-ups');
                          else if (n.linkPath?.includes('appointments')) onNavigate('appointments');
                          else if (n.linkPath?.includes('data-requests')) onNavigate('data-requests');
                          else if (n.linkPath?.includes('workspace')) onNavigate('workspace');
                          else if (n.linkPath?.includes('pipeline')) onNavigate('pipeline');
                          else onNavigate('notifications');
                        }}
                        className={cn(
                          'px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60',
                          !n.isRead && 'bg-blue-50/40 dark:bg-blue-950/20'
                        )}
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{n.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>

      {/* Global Quick Search Modal */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quick Search (Prospects, Campaigns, Deals, Contacts)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                autoFocus
                className="pl-9"
                placeholder="Type at least 2 characters (company, contact, deal, campaign)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {searching && <div className="text-xs text-slate-400 py-4 text-center">Searching workspace...</div>}

            {!searching && searchQuery.trim().length >= 2 && searchResults && (
              <div className="max-h-96 overflow-y-auto space-y-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {searchResults.prospects?.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Prospect Queue</div>
                    {searchResults.prospects.map((p: any) => (
                      <button
                        key={p.recordId}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          onOpenProspectRecord?.(p.recordId);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{p.companyName}</div>
                          <div className="text-slate-500">{p.campaignName}</div>
                        </div>
                        <StatusLabel status={p.status} />
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.deals?.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Deal Pipeline</div>
                    {searchResults.deals.map((d: any) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          onNavigate('pipeline');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{d.title}</div>
                          <div className="text-slate-500 font-mono">{d.dealCode} · {d.companyName}</div>
                        </div>
                        <span className="font-mono font-semibold tabular-nums">{formatCurrency(d.amount)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.campaigns?.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Campaigns</div>
                    {searchResults.campaigns.map((c: any) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          onOpenCampaign?.(c.id);
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{c.name}</div>
                          <div className="text-slate-500 font-mono">{c.campaignCode}</div>
                        </div>
                        <StatusLabel status={c.status} />
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.contacts?.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Contacts</div>
                    {searchResults.contacts.map((ct: any) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          onNavigate(user.role === 'SALES_REP' ? 'workspace' : 'contacts');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{ct.fullName}</div>
                          <div className="text-slate-500">{ct.jobTitle || 'Contact'} · {ct.companyName}</div>
                        </div>
                        <span className="font-mono text-slate-500">{ct.workEmail || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.companies?.length > 0 && (
                  <div className="pt-2 space-y-1">
                    <div className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Companies</div>
                    {searchResults.companies.map((comp: any) => (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() => {
                          setSearchOpen(false);
                          onNavigate('companies');
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 text-left cursor-pointer"
                      >
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{comp.name}</div>
                          <div className="text-slate-500">{comp.industry || 'Industry N/A'}</div>
                        </div>
                        <span className="font-mono text-slate-500">{comp.domain || '—'}</span>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.prospects?.length === 0 &&
                  searchResults.deals?.length === 0 &&
                  searchResults.campaigns?.length === 0 &&
                  searchResults.contacts?.length === 0 &&
                  searchResults.companies?.length === 0 && (
                    <div className="py-6 text-center text-slate-400">No matching records found.</div>
                  )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
