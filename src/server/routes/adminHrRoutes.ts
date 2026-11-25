import crypto from 'crypto';
import { Router } from 'express';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  appSettings,
  assignmentHistory,
  assignments,
  auditLogs,
  campaignCompanyRecords,
  followUps,
  leaveRequests,
  notifications,
  prospectStatuses,
  users,
} from '../../db/schema.ts';
import {
  AuthRequest,
  createNotification,
  hashPassword,
  hashToken,
  logAudit,
  requireAuth,
  requireRole,
  sanitizeUser,
} from '../auth.ts';
import { dispatchExternalAlert, validateSafeWebhookUrl } from '../integrations.ts';

export const adminHrRouter = Router();

// ==================== EMPLOYEES & HR ====================
adminHrRouter.get('/employees', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const allUsers = await db.select().from(users).orderBy(users.id);
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    // Data Managers & Sales Reps only see minimal active roster (no HR details) unless HR_MANAGER / SUPER_ADMIN
    if (user.role === 'SALES_REP') {
      return res.json({
        employees: allUsers
          .filter((u) => u.id === user.id)
          .map((u) => ({ ...sanitizeUser(u), reportingManagerName: u.reportingManagerId ? userMap.get(u.reportingManagerId) : null })),
      });
    }

    if (user.role === 'DATA_MANAGER' || user.role === 'CAMPAIGN_MANAGER') {
      return res.json({
        employees: allUsers
          .filter((u) => u.isActive)
          .map((u) => ({
            id: u.id,
            employeeCode: u.employeeCode,
            fullName: u.fullName,
            email: u.email,
            role: u.role,
            jobRole: u.jobRole,
            department: u.department,
            isActive: u.isActive,
          })),
      });
    }

    // SUPER_ADMIN & HR_MANAGER get full employee profiles (never passwordHash or resetTokenHash)
    res.json({
      employees: allUsers.map((u) => ({
        ...sanitizeUser(u),
        hasPasswordSet: Boolean(u.passwordHash),
        reportingManagerName: u.reportingManagerId ? userMap.get(u.reportingManagerId) || null : null,
      })),
    });
  } catch (error) {
    console.error('List employees error:', error);
    res.status(500).json({ error: 'Failed to load employees.' });
  }
});

adminHrRouter.post(
  '/employees',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const actor = req.currentUser!;
      const body = req.body as Record<string, any>;
      const email = String(body.email || '').trim().toLowerCase();
      const fullName = String(body.fullName || '').trim();
      const role = String(body.role || 'SALES_REP');

      if (!email || !fullName) {
        return res.status(400).json({ error: 'Full name and email are required.' });
      }

      // Only SUPER_ADMIN may create another SUPER_ADMIN
      if (role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only a Super Admin can provision another Super Admin account.' });
      }

      const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (existing.length > 0) {
        return res.status(409).json({ error: 'An employee with this email already exists.' });
      }

      const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const nextNum = 1000 + (countRes[0]?.count ?? 0) + 1;
      const employeeCode = body.employeeCode?.trim() || `EMP-${nextNum}`;
      const username =
        body.username?.trim().toLowerCase() ||
        `${email.split('@')[0]?.replace(/[^a-z0-9.]/gi, '') || 'emp'}.${nextNum}`;

      // Either HR provides an initial temporary password OR server generates a one-time setup token
      let passwordHash: string | null = null;
      let resetTokenHash: string | null = null;
      let resetTokenExpiresAt: Date | null = null;
      let oneTimeInviteToken: string | null = null;
      let mustChangePassword = false;

      if (body.initialPassword && String(body.initialPassword).trim().length >= 8) {
        passwordHash = hashPassword(String(body.initialPassword).trim());
        mustChangePassword = true;
      } else {
        oneTimeInviteToken = crypto.randomBytes(24).toString('base64url');
        resetTokenHash = hashToken(oneTimeInviteToken);
        resetTokenExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 72); // 72h invite
      }

      const [created] = await db
        .insert(users)
        .values({
          employeeCode,
          username,
          email,
          fullName,
          phone: body.phone || null,
          department:
            body.department ||
            (role === 'DATA_MANAGER'
              ? 'Data Operations'
              : role === 'CAMPAIGN_MANAGER'
                ? 'Campaign Operations'
                : role === 'HR_MANAGER'
                  ? 'People & HR'
                  : 'Sales'),
          jobRole:
            body.jobRole ||
            (role === 'DATA_MANAGER'
              ? 'Data Manager'
              : role === 'CAMPAIGN_MANAGER'
                ? 'Campaign Manager'
                : role === 'HR_MANAGER'
                  ? 'HR Manager'
                  : role === 'SUPER_ADMIN'
                    ? 'Super Admin'
                    : 'Sales Representative'),
          role,
          joiningDate: body.joiningDate || new Date().toISOString().slice(0, 10),
          reportingManagerId: body.reportingManagerId ? Number(body.reportingManagerId) : null,
          passwordHash,
          resetTokenHash,
          resetTokenExpiresAt,
          mustChangePassword,
          isActive: true,
        })
        .returning();

      await logAudit({
        user: actor,
        action: 'EMPLOYEE_CREATED',
        entity: 'user',
        entityId: created.id,
        newValue: { email: created.email, role: created.role, employeeCode: created.employeeCode },
      });

      res.status(201).json({
        employee: sanitizeUser(created),
        inviteToken: oneTimeInviteToken, // Returned once only if generated
      });
    } catch (error) {
      console.error('Create employee error:', error);
      res.status(500).json({ error: 'Failed to create employee account.' });
    }
  }
);

adminHrRouter.patch(
  '/employees/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const actor = req.currentUser!;
      const id = Number(req.params.id);
      const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Employee not found.' });

      const body = req.body as Record<string, any>;
      if (body.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Only a Super Admin can assign the Super Admin role.' });
      }
      if (existing.id === actor.id && body.isActive === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own active account.' });
      }

      const [updated] = await db
        .update(users)
        .set({
          fullName: body.fullName !== undefined ? String(body.fullName).trim() : existing.fullName,
          phone: body.phone !== undefined ? body.phone : existing.phone,
          department: body.department !== undefined ? body.department : existing.department,
          jobRole: body.jobRole !== undefined ? body.jobRole : existing.jobRole,
          role: body.role !== undefined ? body.role : existing.role,
          joiningDate: body.joiningDate !== undefined ? body.joiningDate : existing.joiningDate,
          reportingManagerId:
            body.reportingManagerId !== undefined
              ? body.reportingManagerId
                ? Number(body.reportingManagerId)
                : null
              : existing.reportingManagerId,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      if (body.isActive !== undefined && body.isActive !== existing.isActive) {
        await logAudit({
          user: actor,
          action: updated.isActive ? 'EMPLOYEE_ACTIVATED' : 'EMPLOYEE_DEACTIVATED',
          entity: 'user',
          entityId: id,
          previousValue: { isActive: existing.isActive },
          newValue: { isActive: updated.isActive },
        });
      }

      res.json({ employee: sanitizeUser(updated) });
    } catch (error) {
      console.error('Update employee error:', error);
      res.status(500).json({ error: 'Failed to update employee.' });
    }
  }
);

adminHrRouter.post(
  '/employees/:id/reset-password',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Employee not found.' });

      const { newPassword } = req.body as { newPassword?: string };
      if (newPassword && newPassword.trim().length >= 8) {
        await db
          .update(users)
          .set({
            passwordHash: hashPassword(newPassword.trim()),
            resetTokenHash: null,
            resetTokenExpiresAt: null,
            mustChangePassword: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));

        await logAudit({
          user: req.currentUser,
          action: 'EMPLOYEE_PASSWORD_RESET',
          entity: 'user',
          entityId: id,
        });

        return res.json({ ok: true, mode: 'temporary_password_set' });
      }

      const rawToken = crypto.randomBytes(24).toString('base64url');
      await db
        .update(users)
        .set({
          resetTokenHash: hashToken(rawToken),
          resetTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));

      await logAudit({
        user: req.currentUser,
        action: 'EMPLOYEE_RESET_TOKEN_ISSUED',
        entity: 'user',
        entityId: id,
      });

      res.json({ ok: true, mode: 'reset_token_generated', resetToken: rawToken });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Failed to reset employee password.' });
    }
  }
);

// ==================== HR LEAVE REQUESTS ====================
adminHrRouter.get('/hr/leaves', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const [allLeaves, allUsers] = await Promise.all([
      db.select().from(leaveRequests).orderBy(desc(leaveRequests.createdAt)),
      db.select().from(users),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const visible = allLeaves
      .filter((l) => user.role === 'SUPER_ADMIN' || user.role === 'HR_MANAGER' || l.userId === user.id)
      .map((l) => ({
        ...l,
        employeeName: userMap.get(l.userId) || 'Employee',
        reviewedByName: l.reviewedById ? userMap.get(l.reviewedById) || null : null,
      }));

    res.json({ leaves: visible });
  } catch (error) {
    console.error('List leaves error:', error);
    res.status(500).json({ error: 'Failed to load leave requests.' });
  }
});

adminHrRouter.post('/hr/leaves', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, any>;
    if (!body.leaveType || !body.startDate || !body.endDate) {
      return res.status(400).json({ error: 'Leave type, start date, and end date are required.' });
    }
    const [created] = await db
      .insert(leaveRequests)
      .values({
        userId: body.userId && (req.currentUser!.role === 'HR_MANAGER' || req.currentUser!.role === 'SUPER_ADMIN')
          ? Number(body.userId)
          : req.currentUser!.id,
        leaveType: String(body.leaveType),
        startDate: String(body.startDate),
        endDate: String(body.endDate),
        reason: body.reason || null,
        status: 'PENDING',
      })
      .returning();

    res.status(201).json({ leave: created });
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({ error: 'Failed to submit leave request.' });
  }
});

adminHrRouter.patch(
  '/hr/leaves/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body as { status: string };
      const [existing] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Leave request not found.' });

      const [updated] = await db
        .update(leaveRequests)
        .set({ status, reviewedById: req.currentUser!.id })
        .where(eq(leaveRequests.id, id))
        .returning();

      let impactedFollowUps = 0;
      let unworkedAssigned = 0;

      if (status === 'APPROVED') {
        const [fups, ccrs, empRows] = await Promise.all([
          db.select().from(followUps).where(eq(followUps.assignedToId, existing.userId)),
          db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.assignedToId, existing.userId)),
          db.select().from(users).where(eq(users.id, existing.userId)).limit(1),
        ]);
        const emp = empRows[0];
        impactedFollowUps = fups.filter(
          (f) => f.status === 'PENDING' && f.followUpDate >= existing.startDate && f.followUpDate <= existing.endDate
        ).length;
        unworkedAssigned = ccrs.filter((r) => r.status === 'NOT_YET_WORKED').length;

        await createNotification({
          userId: existing.userId,
          type: 'LEAVE_APPROVED',
          title: 'Leave Request Approved',
          message: `Your leave (${existing.startDate} to ${existing.endDate}) was approved.`,
          linkPath: '/leaves',
        });

        if (impactedFollowUps > 0 || unworkedAssigned > 0) {
          const managers = await db.select().from(users);
          for (const mgr of managers.filter((m) => ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(m.role))) {
            await createNotification({
              userId: mgr.id,
              type: 'LEAVE_COVERAGE_NEEDED',
              title: `Leave Coverage Alert: ${emp?.fullName || 'Rep'}`,
              message: `${impactedFollowUps} follow-up(s) during leave and ${unworkedAssigned} unworked queue record(s) may need handoff.`,
              linkPath: '/leaves',
            });
          }
        }

        await dispatchExternalAlert({
          event: 'LEAVE_APPROVED',
          title: `Leave Approved: ${emp?.fullName || 'Team Member'}`,
          message: `${existing.startDate} to ${existing.endDate}. Pending follow-ups in window: ${impactedFollowUps}.`,
        });
      }

      res.json({ leave: updated, impactedFollowUps, unworkedAssigned });
    } catch (error) {
      console.error('Update leave error:', error);
      res.status(500).json({ error: 'Failed to update leave request.' });
    }
  }
);

adminHrRouter.post(
  '/hr/leaves/:id/reassign-work',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { coverRepId, includeQueueRecords = false } = req.body as {
        coverRepId?: number;
        includeQueueRecords?: boolean;
      };
      if (!coverRepId) return res.status(400).json({ error: 'Select a covering sales representative.' });

      const [leave] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id)).limit(1);
      if (!leave) return res.status(404).json({ error: 'Leave request not found.' });

      const fups = await db.select().from(followUps).where(eq(followUps.assignedToId, leave.userId));
      const overlappingFups = fups.filter(
        (f) => f.status === 'PENDING' && f.followUpDate >= leave.startDate && f.followUpDate <= leave.endDate
      );

      for (const f of overlappingFups) {
        await db
          .update(followUps)
          .set({ assignedToId: Number(coverRepId), updatedAt: new Date() })
          .where(eq(followUps.id, f.id));
      }

      let reassignedQueue = 0;
      if (includeQueueRecords) {
        const ccrs = await db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.assignedToId, leave.userId));
        for (const ccr of ccrs.filter((r) => r.status === 'NOT_YET_WORKED')) {
          await db
            .update(assignments)
            .set({ status: 'REASSIGNED' })
            .where(sql`${assignments.campaignCompanyRecordId} = ${ccr.id} AND ${assignments.status} = 'ACTIVE'`);
          await db
            .update(campaignCompanyRecords)
            .set({ assignedToId: Number(coverRepId), assignedById: req.currentUser!.id, updatedAt: new Date() })
            .where(eq(campaignCompanyRecords.id, ccr.id));
          await db.insert(assignmentHistory).values({
            campaignId: ccr.campaignId,
            campaignCompanyRecordId: ccr.id,
            previousAssigneeId: leave.userId,
            newAssigneeId: Number(coverRepId),
            changedById: req.currentUser!.id,
            action: 'REASSIGNED_LEAVE',
            reason: `Leave coverage (${leave.startDate} to ${leave.endDate})`,
          });
          reassignedQueue++;
        }
      }

      await createNotification({
        userId: Number(coverRepId),
        type: 'LEAVE_COVERAGE_ASSIGNED',
        title: `Leave Coverage Assigned`,
        message: `Transferred ${overlappingFups.length} follow-up(s) and ${reassignedQueue} queue record(s) for coverage.`,
        linkPath: '/follow-ups',
      });

      res.json({ reassignedFollowUps: overlappingFups.length, reassignedQueue });
    } catch (error) {
      console.error('Reassign leave work error:', error);
      res.status(500).json({ error: 'Failed to reassign leave coverage.' });
    }
  }
);

// ==================== NOTIFICATIONS ====================
adminHrRouter.get('/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, req.currentUser!.id))
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    res.json({ notifications: list });
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

adminHrRouter.patch('/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    if (!existing || existing.userId !== req.currentUser!.id) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Read notification error:', error);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

adminHrRouter.post('/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, req.currentUser!.id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Read all notifications error:', error);
    res.status(500).json({ error: 'Failed to mark notifications read.' });
  }
});

// ==================== AUDIT LOGS ====================
adminHrRouter.get('/audit-logs', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const search = String(req.query.search || '').trim().toLowerCase();
    const entity = String(req.query.entity || '').trim();
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(300);

    const filtered = logs.filter((l) => {
      if (entity && l.entity !== entity) return false;
      if (search) {
        const hay = `${l.userName || ''} ${l.action} ${l.entity} ${l.entityId || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    res.json({ auditLogs: filtered });
  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// ==================== STATUSES & SETTINGS ====================
adminHrRouter.get('/statuses', requireAuth, async (_req, res) => {
  try {
    const rows = await db.select().from(prospectStatuses).orderBy(prospectStatuses.sortOrder);
    res.json({ statuses: rows });
  } catch (error) {
    console.error('Get statuses error:', error);
    res.status(500).json({ error: 'Failed to load statuses.' });
  }
});

adminHrRouter.post('/statuses', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { code, label, category, isTerminal } = req.body as {
      code: string;
      label: string;
      category?: string;
      isTerminal?: boolean;
    };
    if (!code || !label) return res.status(400).json({ error: 'Code and label are required.' });
    const countRes = await db.select({ count: sql<number>`count(*)::int` }).from(prospectStatuses);
    const [created] = await db
      .insert(prospectStatuses)
      .values({
        code: code.trim().toUpperCase().replace(/\s+/g, '_'),
        label: label.trim(),
        category: category || 'IN_PROGRESS',
        sortOrder: (countRes[0]?.count ?? 0) + 1,
        isTerminal: Boolean(isTerminal),
        isActive: true,
      })
      .returning();
    res.status(201).json({ status: created });
  } catch (error) {
    console.error('Create status error:', error);
    res.status(500).json({ error: 'Failed to add status.' });
  }
});

adminHrRouter.patch('/statuses/:id', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, any>;
    const [existing] = await db.select().from(prospectStatuses).where(eq(prospectStatuses.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Status not found.' });

    const [updated] = await db
      .update(prospectStatuses)
      .set({
        label: body.label !== undefined ? body.label : existing.label,
        category: body.category !== undefined ? body.category : existing.category,
        isTerminal: body.isTerminal !== undefined ? Boolean(body.isTerminal) : existing.isTerminal,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
      })
      .where(eq(prospectStatuses.id, id))
      .returning();

    res.json({ status: updated });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

adminHrRouter.get('/custom-fields', requireAuth, async (_req, res) => {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'custom_fields')).limit(1);
    const value = (row?.value as { companyFields?: string[] } | undefined) || {};
    res.json({ companyFields: Array.isArray(value.companyFields) ? value.companyFields : [] });
  } catch (error) {
    console.error('Get custom fields error:', error);
    res.status(500).json({ error: 'Failed to load custom fields.' });
  }
});

adminHrRouter.get('/settings', requireAuth, requireRole('SUPER_ADMIN'), async (_req, res) => {
  try {
    const rows = await db.select().from(appSettings);
    const map: Record<string, unknown> = {};
    for (const r of rows) map[r.key] = r.value;
    res.json({ settings: map });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

adminHrRouter.patch('/settings', requireAuth, requireRole('SUPER_ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { key, value } = req.body as { key: string; value: any };
    if (!key) return res.status(400).json({ error: 'Setting key is required.' });

    if (key === 'integrations' && value?.slackWebhookUrl) {
      const safe = validateSafeWebhookUrl(String(value.slackWebhookUrl));
      if (!safe) {
        return res.status(400).json({ error: 'Webhook URL must be a valid public HTTPS endpoint.' });
      }
      value.slackWebhookUrl = safe;
    }

    await db
      .insert(appSettings)
      .values({ key, value: value as any, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: value as any, updatedAt: new Date() },
      });

    await logAudit({
      user: req.currentUser,
      action: 'SETTINGS_UPDATED',
      entity: 'app_settings',
      entityId: key,
      newValue: value,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});
