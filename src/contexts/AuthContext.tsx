import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch, registerTokenRefresher, setMemoryToken } from '../lib/api.ts';

export type AppRole = 'SUPER_ADMIN' | 'DATA_MANAGER' | 'CAMPAIGN_MANAGER' | 'HR_MANAGER' | 'SALES_REP';

export interface UserProfile {
  id: number;
  uid: string | null;
  employeeCode: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  department: string;
  jobRole: string;
  role: AppRole;
  joiningDate: string;
  reportingManagerId: number | null;
  isActive: boolean;
  avatarUrl: string | null;
  mustChangePassword: boolean;
}

export interface ProspectStatus {
  id: number;
  code: string;
  label: string;
  category: string;
  sortOrder: number;
  isTerminal: boolean;
  isActive: boolean;
}

export interface OutcomeRule {
  outcome: string;
  label: string;
  resultingStatus: string;
  recommendedChannels: string[];
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: number | null;
  linkPath?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  unreadNotifications: number;
  recentNotifications: AppNotification[];
  statuses: ProspectStatus[];
  outcomeRules: OutcomeRule[];
  loginWithGoogle: () => Promise<void>;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  claimInitialAdmin: (payload: { email: string; fullName: string; password: string }) => Promise<void>;
  acceptInviteToken: (token: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<AppNotification[]>([]);
  const [statuses, setStatuses] = useState<ProspectStatus[]>([]);
  const [outcomeRules, setOutcomeRules] = useState<OutcomeRule[]>([]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me');
      setUser(data.user);
      setUnreadNotifications(data.unreadNotifications || 0);
      setRecentNotifications(data.recentNotifications || []);
      setStatuses(data.statuses || []);
      setOutcomeRules(data.outcomeRules || []);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    registerTokenRefresher(async () => {
      if (auth.currentUser) {
        const t = await auth.currentUser.getIdToken(true);
        setMemoryToken(t);
        return t;
      }
      return null;
    });

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          setMemoryToken(token);
          await refreshProfile();
        } catch {
          setUser(null);
        }
      } else {
        setLoading(false);
      }
      setLoading(false);
    });

    return () => {
      unsub();
      registerTokenRefresher(null);
    };
  }, [refreshProfile]);

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const token = await cred.user.getIdToken();
    setMemoryToken(token);
    await refreshProfile();
  }, [refreshProfile]);

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string) => {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      setMemoryToken(res.token);
      await refreshProfile();
    },
    [refreshProfile]
  );

  const claimInitialAdmin = useCallback(
    async (payload: { email: string; fullName: string; password: string }) => {
      const res = await apiFetch('/api/auth/claim-admin', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setMemoryToken(res.token);
      await refreshProfile();
    },
    [refreshProfile]
  );

  const acceptInviteToken = useCallback(
    async (token: string, newPassword: string) => {
      const res = await apiFetch('/api/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setMemoryToken(res.token);
      await refreshProfile();
    },
    [refreshProfile]
  );

  const logout = useCallback(async () => {
    setMemoryToken(null);
    setUser(null);
    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore if signed in via employee session token
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        darkMode,
        toggleDarkMode,
        unreadNotifications,
        recentNotifications,
        statuses,
        outcomeRules,
        loginWithGoogle,
        loginWithCredentials,
        claimInitialAdmin,
        acceptInviteToken,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
