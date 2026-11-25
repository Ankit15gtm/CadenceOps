import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { apiFetch } from '../lib/api.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input, Label } from '../components/ui/form.tsx';

export function LoginPage() {
  const { loginWithGoogle, loginWithCredentials, claimInitialAdmin, acceptInviteToken } = useAuth();
  const [mode, setMode] = useState<'login' | 'invite' | 'claim'>('login');
  const [needsAdminClaim, setNeedsAdminClaim] = useState(false);
  const [suggestedEmail, setSuggestedEmail] = useState('elena@cadenceops.io');
  const [suggestedName, setSuggestedName] = useState('Elena Vance');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [claimEmail, setClaimEmail] = useState('elena@cadenceops.io');
  const [claimName, setClaimName] = useState('Elena Vance');
  const [claimPassword, setClaimPassword] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch('/api/auth/bootstrap-status')
      .then((res) => {
        setNeedsAdminClaim(Boolean(res.needsAdminClaim));
        if (res.suggestedAdminEmail) {
          setSuggestedEmail(res.suggestedAdminEmail);
          setClaimEmail(res.suggestedAdminEmail);
        }
        if (res.suggestedAdminName) {
          setSuggestedName(res.suggestedAdminName);
          setClaimName(res.suggestedAdminName);
        }
      })
      .catch(() => {});
  }, []);

  const handleGoogle = async () => {
    setBusy(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      toast.error(err?.message || 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await loginWithCredentials(identifier, password);
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await claimInitialAdmin({ email: claimEmail, fullName: claimName, password: claimPassword });
      toast.success('Super Admin account initialized and signed in.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to claim Super Admin account');
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await acceptInviteToken(inviteToken, invitePassword);
      toast.success('Password configured. Welcome to CadenceOps.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to activate invite token');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto space-y-6">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            CadenceOps
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            B2B Prospecting, Data Distribution &amp; Sales Operations CRM
          </p>
        </div>

        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-base">Sign in to your workspace</CardTitle>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => setMode('login')}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  mode === 'login'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMode('invite')}
                className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  mode === 'invite'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Invite Token
              </button>
              {needsAdminClaim && (
                <button
                  type="button"
                  onClick={() => setMode('claim')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                    mode === 'claim'
                      ? 'bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400 shadow-xs'
                      : 'text-blue-700 dark:text-blue-400 hover:text-blue-800'
                  }`}
                >
                  First-Run Setup
                </button>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            {mode === 'login' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10"
                  onClick={handleGoogle}
                  disabled={busy}
                >
                  <UserCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                  <span>Continue with Google</span>
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200 dark:border-slate-800" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-500">
                      Or sign in with employee credentials
                    </span>
                  </div>
                </div>

                <form onSubmit={handleCredentials} className="space-y-4">
                  <div>
                    <Label htmlFor="identifier">Work Email or Username</Label>
                    <Input
                      id="identifier"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@company.com"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>

                {needsAdminClaim && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
                    <span>First time deploying this workspace?</span>
                    <button
                      type="button"
                      onClick={() => setMode('claim')}
                      className="font-medium text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Claim Super Admin
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === 'invite' && (
              <form onSubmit={handleAcceptInvite} className="space-y-4">
                <div className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                  <KeyRound className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>Paste the one-time setup or password reset token provided by your HR Manager or Administrator.</span>
                </div>
                <div>
                  <Label htmlFor="inviteToken">Setup / Reset Token</Label>
                  <Input
                    id="inviteToken"
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    placeholder="Paste invite token"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="invitePassword">New Password (min 8 chars)</Label>
                  <Input
                    id="invitePassword"
                    type="password"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Choose a strong password"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Activating...' : 'Set Password & Sign In'}
                </Button>
              </form>
            )}

            {mode === 'claim' && needsAdminClaim && (
              <form onSubmit={handleClaimAdmin} className="space-y-4">
                <div className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-700 shrink-0 mt-0.5" />
                  <span>
                    Configure the initial Super Admin password for <strong className="font-medium">{suggestedName}</strong> ({suggestedEmail}). Once claimed, this setup form locks permanently.
                  </span>
                </div>
                <div>
                  <Label htmlFor="claimName">Full Name</Label>
                  <Input
                    id="claimName"
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="claimEmail">Super Admin Email</Label>
                  <Input
                    id="claimEmail"
                    type="email"
                    value={claimEmail}
                    onChange={(e) => setClaimEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="claimPassword">Admin Password (min 8 chars)</Label>
                  <Input
                    id="claimPassword"
                    type="password"
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    minLength={8}
                    placeholder="Create Super Admin password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Initializing...' : 'Initialize Super Admin'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
