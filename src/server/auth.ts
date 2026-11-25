import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { users, auditLogs, notifications } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

// Ephemeral fallback if SESSION_SECRET env var is not configured
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : EPHEMERAL_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  if (!salt || !originalHash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const originalBuffer = Buffer.from(originalHash, 'hex');
  if (derived.length !== originalBuffer.length) return false;
  return crypto.timingSafeEqual(derived, originalBuffer);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signSessionToken(payload: { userId: number; role: string; email: string }): string {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  return `cops.${body}.${sig}`;
}

export function verifySessionToken(token: string): { userId: number; role: string; email: string; exp: number } | null {
  if (!token.startsWith('cops.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, body, sig] = parts;
  if (!body || !sig) return null;

  const expectedSig = crypto.createHmac('sha256', getSessionSecret()).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

export type AppRole = 'SUPER_ADMIN' | 'DATA_MANAGER' | 'CAMPAIGN_MANAGER' | 'HR_MANAGER' | 'SALES_REP';

export interface AuthenticatedUser {
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

export interface AuthRequest extends Request {
  currentUser?: AuthenticatedUser;
}

function sanitizeUser(u: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: u.id,
    uid: u.uid,
    employeeCode: u.employeeCode,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    department: u.department,
    jobRole: u.jobRole,
    role: u.role as AppRole,
    joiningDate: u.joiningDate,
    reportingManagerId: u.reportingManagerId,
    isActive: u.isActive,
    avatarUrl: u.avatarUrl,
    mustChangePassword: u.mustChangePassword,
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized: Empty token' });
    }

    // 1. Check custom employee HMAC session token
    if (token.startsWith('cops.')) {
      const verified = verifySessionToken(token);
      if (!verified) {
        return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
      }
      const [user] = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1);
      if (!user) {
        return res.status(401).json({ error: 'Account not found.' });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: 'Your account has been deactivated. Contact HR or an administrator.' });
      }
      req.currentUser = sanitizeUser(user);
      return next();
    }

    // 2. Otherwise verify Firebase ID token (Google Sign-In)
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || '').trim().toLowerCase();
    const uid = decoded.uid;

    let [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.uid, uid), email ? eq(users.email, email) : sql`false`))
      .limit(1);

    if (!user) {
      // Auto-provision first Google user or link as SUPER_ADMIN if no uid-linked admin exists yet
      const existingAdmins = await db
        .select({ id: users.id, uid: users.uid })
        .from(users)
        .where(eq(users.role, 'SUPER_ADMIN'));

      const hasLinkedAdmin = existingAdmins.some((a) => Boolean(a.uid));
      // If there's a seeded Super Admin without a uid yet and this is the first Google sign-in,
      // create a Super Admin record (or grant SUPER_ADMIN role if first Google user)
      const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const totalUsers = countRes[0]?.count ?? 0;

      const assignedRole: AppRole = totalUsers === 0 || !hasLinkedAdmin ? 'SUPER_ADMIN' : 'SALES_REP';
      const baseName = decoded.name || (email ? email.split('@')[0] : 'Team Member');
      const code = `EMP-${1000 + totalUsers + 1}`;
      const usernameBase = (email ? email.split('@')[0] : uid.slice(0, 8)).replace(/[^a-z0-9_]/gi, '').toLowerCase() || 'user';

      const [inserted] = await db
        .insert(users)
        .values({
          uid,
          employeeCode: code,
          username: `${usernameBase}_${Date.now().toString().slice(-4)}`,
          email: email || `${uid}@firebase.local`,
          fullName: baseName,
          department: assignedRole === 'SUPER_ADMIN' ? 'Executive' : 'Sales',
          jobRole: assignedRole === 'SUPER_ADMIN' ? 'Super Admin' : 'Sales Representative',
          role: assignedRole,
          joiningDate: new Date().toISOString().slice(0, 10),
          isActive: true,
          avatarUrl: decoded.picture || null,
        })
        .onConflictDoUpdate({
          target: users.email,
          set: { uid, avatarUrl: decoded.picture || null, updatedAt: new Date() },
        })
        .returning();

      user = inserted;
    } else if (!user.uid) {
      const [updated] = await db
        .update(users)
        .set({ uid, avatarUrl: user.avatarUrl || decoded.picture || null, updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning();
      user = updated;
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Your account has been deactivated. Contact HR or an administrator.' });
    }

    req.currentUser = sanitizeUser(user);
    return next();
  } catch (err) {
    console.error('Auth verification error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials' });
  }
}

export function requireRole(...allowedRoles: AppRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!allowedRoles.includes(req.currentUser.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient role permissions for this action' });
    }
    next();
  };
}

export async function logAudit(params: {
  user?: AuthenticatedUser | null;
  action: string;
  entity: string;
  entityId?: string | number | null;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: params.user?.id ?? null,
      userName: params.user?.fullName ?? 'System',
      action: params.action,
      entity: params.entity,
      entityId: params.entityId != null ? String(params.entityId) : null,
      previousValue: params.previousValue ?? null,
      newValue: params.newValue ?? null,
    });
  } catch (error) {
    console.error('Audit log insert failed:', error);
  }
}

export async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  linkPath?: string;
}) {
  try {
    await db.insert(notifications).values({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      linkPath: params.linkPath ?? null,
    });
  } catch (error) {
    console.error('Notification insert failed:', error);
  }
}

export { sanitizeUser };
