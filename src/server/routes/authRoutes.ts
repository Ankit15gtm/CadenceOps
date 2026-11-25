import crypto from 'crypto';
import { Router } from 'express';
import { eq, or, sql, and, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { users, notifications, prospectStatuses, appSettings } from '../../db/schema.ts';
import {
  AuthRequest,
  createNotification,
  hashPassword,
  hashToken,
  logAudit,
  requireAuth,
  sanitizeUser,
  signSessionToken,
  verifyPassword,
} from '../auth.ts';
import { sendSystemEmail } from '../integrations.ts';
import { ensureSeeded } from '../seed.ts';
import { DEFAULT_OUTCOME_RULES } from '../workflow.ts';

export const authRouter = Router();

authRouter.get('/bootstrap-status', async (_req, res) => {
  try {
    await ensureSeeded();
    const admins = await db
      .select({ id: users.id, passwordHash: users.passwordHash, email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.role, 'SUPER_ADMIN'));

    const anyAdminPasswordClaimed = admins.some((a) => Boolean(a.passwordHash));
    const passcodeConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    const defaultAdmin = admins[0] || null;

    res.json({
      needsAdminClaim: !anyAdminPasswordClaimed && !passcodeConfigured,
      suggestedAdminEmail: defaultAdmin?.email || 'admin@cadenceops.io',
      suggestedAdminName: defaultAdmin?.fullName || 'Elena Vance',
    });
  } catch (error) {
    console.error('Bootstrap status failed:', error);
    res.status(500).json({ error: 'Unable to check workspace initialization status.' });
  }
});

authRouter.post('/claim-admin', async (req, res) => {
  try {
    await ensureSeeded();
    const { email, fullName, password } = req.body as { email?: string; fullName?: string; password?: string };

    if (!password || password.trim().length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const passcodeConfigured = Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim().length > 0);
    if (passcodeConfigured) {
      return res.status(403).json({ error: 'Admin access is managed via environment configuration.' });
    }

    const admins = await db.select().from(users).where(eq(users.role, 'SUPER_ADMIN'));
    if (admins.some((a) => Boolean(a.passwordHash))) {
      return res.status(409).json({ error: 'Initial Super Admin password has already been claimed.' });
    }

    const cleanEmail = (email || admins[0]?.email || 'elena@cadenceops.io').trim().toLowerCase();
    const passwordHash = hashPassword(password.trim());

    let adminUser;
    if (admins[0]) {
      const [updated] = await db
        .update(users)
        .set({
          email: cleanEmail,
          fullName: fullName?.trim() || admins[0].fullName,
          passwordHash,
          mustChangePassword: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, admins[0].id))
        .returning();
      adminUser = updated;
    } else {
      const [inserted] = await db
        .insert(users)
        .values({
          employeeCode: 'EMP-1001',
          username: cleanEmail.split('@')[0] || 'admin',
          email: cleanEmail,
          fullName: fullName?.trim() || 'Super Admin',
          passwordHash,
          department: 'Executive',
          jobRole: 'Super Admin',
          role: 'SUPER_ADMIN',
          joiningDate: new Date().toISOString().slice(0, 10),
          isActive: true,
        })
        .returning();
      adminUser = inserted;
    }

    const token = signSessionToken({
      userId: adminUser.id,
      role: adminUser.role,
      email: adminUser.email,
    });

    await logAudit({
      user: sanitizeUser(adminUser),
      action: 'ADMIN_CLAIMED',
      entity: 'user',
      entityId: adminUser.id,
      newValue: { email: adminUser.email },
    });

    res.json({ token, user: sanitizeUser(adminUser) });
  } catch (error) {
    console.error('Claim admin error:', error);
    res.status(500).json({ error: 'Failed to claim Super Admin account.' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    await ensureSeeded();
    const { identifier, password } = req.body as { identifier?: string; password?: string };
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email or username and password are required.' });
    }

    const lookup = identifier.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, lookup), eq(users.username, lookup)))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated. Please contact HR.' });
    }

    // Optional server env ADMIN_PASSCODE override for SUPER_ADMIN
    const envPasscode = process.env.ADMIN_PASSCODE?.trim();
    const isEnvPasscodeMatch =
      user.role === 'SUPER_ADMIN' && envPasscode && envPasscode.length > 0 && password === envPasscode;

    if (!isEnvPasscodeMatch) {
      if (!user.passwordHash || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Invalid credentials. If your password has not been set yet, use Google Sign-In or an HR invite token.' });
      }
    }

    const token = signSessionToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });

    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed. Please try again.' });
  }
});

authRouter.post('/accept-invite', async (req, res) => {
  try {
    await ensureSeeded();
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({ error: 'Valid setup token and a password of at least 8 characters are required.' });
    }

    const hashed = hashToken(token.trim());
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.resetTokenHash, hashed))
      .limit(1);

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invite or reset token is invalid or has expired.' });
    }

    const [updated] = await db
      .update(users)
      .set({
        passwordHash: hashPassword(newPassword.trim()),
        resetTokenHash: null,
        resetTokenExpiresAt: null,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    const sessionToken = signSessionToken({
      userId: updated.id,
      role: updated.role,
      email: updated.email,
    });

    await logAudit({
      user: sanitizeUser(updated),
      action: 'PASSWORD_SETUP_COMPLETED',
      entity: 'user',
      entityId: updated.id,
    });

    res.json({ token: sessionToken, user: sanitizeUser(updated) });
  } catch (error) {
    console.error('Accept invite error:', error);
    res.status(500).json({ error: 'Failed to set account password.' });
  }
});

authRouter.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.currentUser!.id)).limit(1);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (user.passwordHash) {
      if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(newPassword.trim()),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await logAudit({
      user: req.currentUser,
      action: 'PASSWORD_CHANGED',
      entity: 'user',
      entityId: user.id,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

authRouter.post('/request-password-reset', async (req, res) => {
  try {
    await ensureSeeded();
    const { identifier } = req.body as { identifier?: string };
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ error: 'Work email or username is required.' });
    }

    const lookup = identifier.trim().toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(or(eq(users.email, lookup), eq(users.username, lookup)))
      .limit(1);

    let deliveredByEmail = false;
    if (user && user.isActive) {
      const token = crypto.randomBytes(24).toString('base64url');
      await db
        .update(users)
        .set({
          resetTokenHash: hashToken(token),
          resetTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      deliveredByEmail = await sendSystemEmail({
        to: user.email,
        subject: 'CadenceOps Password Reset Token',
        text: `Hello ${user.fullName},\n\nUse this one-time token in CadenceOps -> Invite Token to set a new password (expires in 1 hour):\n\n${token}\n\nIf you did not request this, ignore this email.`,
      });

      const adminsAndHr = await db
        .select()
        .from(users)
        .where(or(eq(users.role, 'SUPER_ADMIN'), eq(users.role, 'HR_MANAGER')));
      for (const mgr of adminsAndHr) {
        await createNotification({
          userId: mgr.id,
          type: 'PASSWORD_RESET_REQUESTED',
          title: `Password Reset Requested: ${user.fullName}`,
          message: deliveredByEmail
            ? `Reset email dispatched to ${user.email}.`
            : `${user.fullName} (${user.email}) requested a password reset. Issue a new reset token in HR & Employees if email relay is not configured.`,
          entityType: 'user',
          entityId: user.id,
          linkPath: '/employees',
        });
      }
    }

    res.json({
      ok: true,
      deliveredByEmail,
      message: deliveredByEmail
        ? 'If an active account matches that email, a reset token has been sent to your inbox.'
        : 'Password reset request logged. If email delivery is not configured, ask your HR Manager or Admin to issue a one-time token in HR & Employees.',
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({ error: 'Failed to process password reset request.' });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const user = req.currentUser!;

    const unreadRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));

    const statuses = await db
      .select()
      .from(prospectStatuses)
      .where(eq(prospectStatuses.isActive, true))
      .orderBy(prospectStatuses.sortOrder);

    const [rulesSetting] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'outcome_rules'))
      .limit(1);

    const recentNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(10);

    res.json({
      user,
      unreadNotifications: unreadRes[0]?.count ?? 0,
      recentNotifications,
      statuses,
      outcomeRules: (rulesSetting?.value as typeof DEFAULT_OUTCOME_RULES) || DEFAULT_OUTCOME_RULES,
    });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Failed to load user profile.' });
  }
});
