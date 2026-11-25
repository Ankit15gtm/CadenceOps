import { Router } from 'express';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activities,
  appointments,
  assignmentHistory,
  assignments,
  campaignCompanyRecords,
  campaignContactRecords,
  campaigns,
  companies,
  contacts,
  dataFlags,
  deals,
  dncSuppression,
  followUps,
  outreachTemplates,
  prospectRemarks,
  savedViews,
  sequenceEnrollments,
  sequences,
  sequenceSteps,
  users,
} from '../../db/schema.ts';
import { AuthRequest, createNotification, logAudit, requireAuth, requireRole } from '../auth.ts';
import { dispatchExternalAlert, normalizeDncValue } from '../integrations.ts';
import { normalizeCompanyName, normalizeDomain, normalizeEmail, normalizeLinkedin, normalizePhone, normalizeWebsite } from '../normalization.ts';

export const enterpriseRouter = Router();

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ==================== GLOBAL DNC SUPPRESSION ====================
enterpriseRouter.get('/dnc', requireAuth, async (_req, res) => {
  try {
    const [rows, allUsers] = await Promise.all([
      db.select().from(dncSuppression).orderBy(desc(dncSuppression.createdAt)),
      db.select().from(users),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));
    res.json({
      entries: rows.map((r) => ({
        ...r,
        addedByName: r.addedById ? userMap.get(r.addedById) || 'Team Member' : 'System',
      })),
    });
  } catch (error) {
    console.error('List DNC error:', error);
    res.status(500).json({ error: 'Failed to load suppression list.' });
  }
});

enterpriseRouter.post('/dnc', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { type, value, reason } = req.body as { type?: string; value?: string; reason?: string };
    const cleanType = String(type || 'EMAIL').toUpperCase();
    if (!['DOMAIN', 'EMAIL', 'PHONE'].includes(cleanType) || !value || !value.trim()) {
      return res.status(400).json({ error: 'Valid suppression type (DOMAIN, EMAIL, PHONE) and value are required.' });
    }

    const normalized = normalizeDncValue(cleanType, value);
    if (!normalized) {
      return res.status(400).json({ error: 'Could not normalize suppression value.' });
    }

    const [created] = await db
      .insert(dncSuppression)
      .values({
        type: cleanType,
        value: normalized,
        rawValue: value.trim(),
        reason: reason?.trim() || 'Added to global suppression list',
        addedById: req.currentUser!.id,
      })
      .onConflictDoNothing()
      .returning();

    if (cleanType === 'EMAIL') {
      await db.update(contacts).set({ doNotContact: true, updatedAt: new Date() }).where(eq(contacts.normalizedEmail, normalized));
    } else if (cleanType === 'PHONE') {
      await db.update(contacts).set({ doNotContact: true, updatedAt: new Date() }).where(eq(contacts.normalizedPhone, normalized));
    }

    await logAudit({
      user: req.currentUser,
      action: 'DNC_ADDED',
      entity: 'dnc_suppression',
      entityId: created?.id || normalized,
      newValue: { type: cleanType, value: normalized, reason },
    });

    res.status(201).json({ entry: created || { type: cleanType, value: normalized }, duplicate: !created });
  } catch (error) {
    console.error('Add DNC error:', error);
    res.status(500).json({ error: 'Failed to add suppression entry.' });
  }
});

enterpriseRouter.delete(
  '/dnc/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [removed] = await db.delete(dncSuppression).where(eq(dncSuppression.id, id)).returning();
      if (!removed) return res.status(404).json({ error: 'Suppression entry not found.' });

      await logAudit({
        user: req.currentUser,
        action: 'DNC_REMOVED',
        entity: 'dnc_suppression',
        entityId: id,
        previousValue: { type: removed.type, value: removed.value },
      });

      res.json({ ok: true });
    } catch (error) {
      console.error('Delete DNC error:', error);
      res.status(500).json({ error: 'Failed to remove suppression entry.' });
    }
  }
);

// ==================== OUTREACH TEMPLATES & CALL SCRIPTS ====================
enterpriseRouter.get('/templates', requireAuth, async (req, res) => {
  try {
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : null;
    const channel = req.query.channel ? String(req.query.channel) : null;
    const rows = await db.select().from(outreachTemplates).orderBy(desc(outreachTemplates.updatedAt));
    const filtered = rows.filter((t) => {
      if (campaignId && t.campaignId && t.campaignId !== campaignId) return false;
      if (channel && t.channel !== channel) return false;
      return true;
    });
    res.json({ templates: filtered });
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to load outreach templates.' });
  }
});

enterpriseRouter.post(
  '/templates',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { campaignId, name, channel, subject, body } = req.body as Record<string, any>;
      if (!name || !channel || !body) {
        return res.status(400).json({ error: 'Template name, channel, and body are required.' });
      }
      const [created] = await db
        .insert(outreachTemplates)
        .values({
          campaignId: campaignId ? Number(campaignId) : null,
          name: String(name).trim(),
          channel: String(channel),
          subject: subject ? String(subject).trim() : null,
          body: String(body),
          createdById: req.currentUser!.id,
        })
        .returning();

      await logAudit({
        user: req.currentUser,
        action: 'TEMPLATE_CREATED',
        entity: 'outreach_template',
        entityId: created.id,
        newValue: { name: created.name, channel: created.channel },
      });

      res.status(201).json({ template: created });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({ error: 'Failed to create outreach template.' });
    }
  }
);

enterpriseRouter.patch(
  '/templates/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(outreachTemplates).where(eq(outreachTemplates.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Template not found.' });

      const body = req.body as Record<string, any>;
      const [updated] = await db
        .update(outreachTemplates)
        .set({
          name: body.name !== undefined ? String(body.name).trim() : existing.name,
          channel: body.channel !== undefined ? String(body.channel) : existing.channel,
          subject: body.subject !== undefined ? body.subject : existing.subject,
          body: body.body !== undefined ? String(body.body) : existing.body,
          campaignId: body.campaignId !== undefined ? (body.campaignId ? Number(body.campaignId) : null) : existing.campaignId,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
          updatedAt: new Date(),
        })
        .where(eq(outreachTemplates.id, id))
        .returning();

      res.json({ template: updated });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({ error: 'Failed to update template.' });
    }
  }
);

enterpriseRouter.delete(
  '/templates/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      await db.delete(outreachTemplates).where(eq(outreachTemplates.id, id));
      res.json({ ok: true });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({ error: 'Failed to delete template.' });
    }
  }
);

// ==================== AUTOMATED MULTI-TOUCH SEQUENCES ====================
enterpriseRouter.get('/sequences', requireAuth, async (req, res) => {
  try {
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : null;
    const [allSeqs, allSteps, allEnrollments] = await Promise.all([
      db.select().from(sequences).orderBy(desc(sequences.createdAt)),
      db.select().from(sequenceSteps).orderBy(sequenceSteps.stepOrder),
      db.select().from(sequenceEnrollments),
    ]);

    const filtered = campaignId ? allSeqs.filter((s) => !s.campaignId || s.campaignId === campaignId) : allSeqs;

    res.json({
      sequences: filtered.map((s) => {
        const steps = allSteps.filter((st) => st.sequenceId === s.id);
        const enrolls = allEnrollments.filter((e) => e.sequenceId === s.id);
        return {
          ...s,
          steps,
          activeEnrollments: enrolls.filter((e) => e.status === 'ACTIVE').length,
          completedEnrollments: enrolls.filter((e) => e.status === 'COMPLETED').length,
          stoppedEnrollments: enrolls.filter((e) => e.status.startsWith('STOPPED_')).length,
        };
      }),
    });
  } catch (error) {
    console.error('List sequences error:', error);
    res.status(500).json({ error: 'Failed to load sequences.' });
  }
});

enterpriseRouter.post(
  '/sequences',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { campaignId, name, description, stopOnReply = true, stopOnAppointment = true, steps } = req.body as {
        campaignId?: number | null;
        name?: string;
        description?: string;
        stopOnReply?: boolean;
        stopOnAppointment?: boolean;
        steps?: Array<{ delayDays: number; channel: string; templateId?: number | null; instructions?: string }>;
      };

      if (!name || !Array.isArray(steps) || steps.length === 0) {
        return res.status(400).json({ error: 'Sequence name and at least one step are required.' });
      }

      const [created] = await db
        .insert(sequences)
        .values({
          campaignId: campaignId ? Number(campaignId) : null,
          name: name.trim(),
          description: description || null,
          stopOnReply: Boolean(stopOnReply),
          stopOnAppointment: Boolean(stopOnAppointment),
          createdById: req.currentUser!.id,
        })
        .returning();

      const createdSteps = [];
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i]!;
        const [stepRow] = await db
          .insert(sequenceSteps)
          .values({
            sequenceId: created.id,
            stepOrder: i + 1,
            delayDays: Number(st.delayDays ?? 0),
            channel: st.channel,
            templateId: st.templateId ? Number(st.templateId) : null,
            instructions: st.instructions || null,
          })
          .returning();
        createdSteps.push(stepRow);
      }

      await logAudit({
        user: req.currentUser,
        action: 'SEQUENCE_CREATED',
        entity: 'sequence',
        entityId: created.id,
        newValue: { name: created.name, stepsCount: createdSteps.length },
      });

      res.status(201).json({ sequence: { ...created, steps: createdSteps } });
    } catch (error) {
      console.error('Create sequence error:', error);
      res.status(500).json({ error: 'Failed to create sequence.' });
    }
  }
);

enterpriseRouter.patch(
  '/sequences/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(sequences).where(eq(sequences.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Sequence not found.' });

      const body = req.body as Record<string, any>;
      const [updated] = await db
        .update(sequences)
        .set({
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : existing.isActive,
          stopOnReply: body.stopOnReply !== undefined ? Boolean(body.stopOnReply) : existing.stopOnReply,
          stopOnAppointment:
            body.stopOnAppointment !== undefined ? Boolean(body.stopOnAppointment) : existing.stopOnAppointment,
        })
        .where(eq(sequences.id, id))
        .returning();

      res.json({ sequence: updated });
    } catch (error) {
      console.error('Update sequence error:', error);
      res.status(500).json({ error: 'Failed to update sequence.' });
    }
  }
);

enterpriseRouter.post('/sequences/:id/enroll', requireAuth, async (req: AuthRequest, res) => {
  try {
    const sequenceId = Number(req.params.id);
    const { recordIds, contactId } = req.body as { recordIds?: number[]; contactId?: number | null };
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one prospect record to enroll.' });
    }

    const [seq] = await db.select().from(sequences).where(eq(sequences.id, sequenceId)).limit(1);
    if (!seq) return res.status(404).json({ error: 'Sequence not found.' });

    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, sequenceId))
      .orderBy(sequenceSteps.stepOrder);

    const firstStep = steps[0];
    if (!firstStep) return res.status(400).json({ error: 'Sequence has no configured steps.' });

    const records = await db
      .select()
      .from(campaignCompanyRecords)
      .where(inArray(campaignCompanyRecords.id, recordIds.map(Number)));

    let enrolledCount = 0;
    for (const rec of records) {
      if (req.currentUser!.role === 'SALES_REP' && rec.assignedToId !== req.currentUser!.id) {
        continue;
      }
      const dueDate = addDaysIso(firstStep.delayDays);
      await db
        .insert(sequenceEnrollments)
        .values({
          sequenceId,
          campaignCompanyRecordId: rec.id,
          contactId: contactId ? Number(contactId) : null,
          enrolledById: req.currentUser!.id,
          currentStepOrder: 1,
          nextDueDate: dueDate,
          status: 'ACTIVE',
        })
        .onConflictDoUpdate({
          target: [sequenceEnrollments.sequenceId, sequenceEnrollments.campaignCompanyRecordId],
          set: {
            currentStepOrder: 1,
            nextDueDate: dueDate,
            status: 'ACTIVE',
            updatedAt: new Date(),
          },
        });

      const assigneeId = rec.assignedToId || req.currentUser!.id;
      const followUpType =
        firstStep.channel === 'PHONE_CALL'
          ? 'CALL'
          : firstStep.channel === 'LINKEDIN_CONNECTION' || firstStep.channel === 'LINKEDIN_MESSAGE'
            ? 'LINKEDIN_MESSAGE'
            : firstStep.channel;

      await db.insert(followUps).values({
        campaignId: rec.campaignId,
        campaignCompanyRecordId: rec.id,
        companyId: rec.companyId,
        contactId: contactId ? Number(contactId) : null,
        assignedToId: assigneeId,
        followUpType,
        followUpDate: dueDate,
        followUpTime: '09:30',
        notes: `[Sequence: ${seq.name} · Step 1] ${firstStep.instructions || 'Execute outreach step'}`,
        status: 'PENDING',
      });

      await db
        .update(campaignCompanyRecords)
        .set({ nextFollowUpAt: new Date(`${dueDate}T09:30:00`), updatedAt: new Date() })
        .where(eq(campaignCompanyRecords.id, rec.id));

      enrolledCount++;
    }

    res.json({ enrolledCount });
  } catch (error) {
    console.error('Enroll sequence error:', error);
    res.status(500).json({ error: 'Failed to enroll records in sequence.' });
  }
});

enterpriseRouter.post('/sequence-enrollments/:id/action', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const { action } = req.body as { action?: 'PAUSE' | 'RESUME' | 'ADVANCE' | 'STOP' };
    const [enrollment] = await db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, id)).limit(1);
    if (!enrollment) return res.status(404).json({ error: 'Enrollment not found.' });

    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, enrollment.campaignCompanyRecordId))
      .limit(1);

    if (req.currentUser!.role === 'SALES_REP' && ccr && ccr.assignedToId !== req.currentUser!.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    if (action === 'PAUSE') {
      const [updated] = await db
        .update(sequenceEnrollments)
        .set({ status: 'PAUSED', updatedAt: new Date() })
        .where(eq(sequenceEnrollments.id, id))
        .returning();
      return res.json({ enrollment: updated });
    }
    if (action === 'RESUME') {
      const [updated] = await db
        .update(sequenceEnrollments)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(sequenceEnrollments.id, id))
        .returning();
      return res.json({ enrollment: updated });
    }
    if (action === 'STOP') {
      const [updated] = await db
        .update(sequenceEnrollments)
        .set({ status: 'STOPPED_MANUAL', updatedAt: new Date() })
        .where(eq(sequenceEnrollments.id, id))
        .returning();
      return res.json({ enrollment: updated });
    }

    // ADVANCE to next step
    const [seq] = await db.select().from(sequences).where(eq(sequences.id, enrollment.sequenceId)).limit(1);
    const steps = await db
      .select()
      .from(sequenceSteps)
      .where(eq(sequenceSteps.sequenceId, enrollment.sequenceId))
      .orderBy(sequenceSteps.stepOrder);

    const nextStep = steps.find((s) => s.stepOrder === enrollment.currentStepOrder + 1);
    if (!nextStep) {
      const [completed] = await db
        .update(sequenceEnrollments)
        .set({ status: 'COMPLETED', updatedAt: new Date() })
        .where(eq(sequenceEnrollments.id, id))
        .returning();
      return res.json({ enrollment: completed, completed: true });
    }

    const dueDate = addDaysIso(nextStep.delayDays);
    const [updated] = await db
      .update(sequenceEnrollments)
      .set({
        currentStepOrder: nextStep.stepOrder,
        nextDueDate: dueDate,
        status: 'ACTIVE',
        updatedAt: new Date(),
      })
      .where(eq(sequenceEnrollments.id, id))
      .returning();

    if (ccr) {
      const followUpType =
        nextStep.channel === 'PHONE_CALL'
          ? 'CALL'
          : nextStep.channel === 'LINKEDIN_CONNECTION' || nextStep.channel === 'LINKEDIN_MESSAGE'
            ? 'LINKEDIN_MESSAGE'
            : nextStep.channel;
      await db.insert(followUps).values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        companyId: ccr.companyId,
        contactId: enrollment.contactId,
        assignedToId: ccr.assignedToId || req.currentUser!.id,
        followUpType,
        followUpDate: dueDate,
        followUpTime: '09:30',
        notes: `[Sequence: ${seq?.name || 'Cadence'} · Step ${nextStep.stepOrder}] ${nextStep.instructions || 'Next touchpoint'}`,
        status: 'PENDING',
      });
    }

    res.json({ enrollment: updated, nextStep });
  } catch (error) {
    console.error('Sequence action error:', error);
    res.status(500).json({ error: 'Failed to update sequence enrollment.' });
  }
});

// ==================== COMPANY & CONTACT EDIT / MERGE / BULK ====================
enterpriseRouter.patch('/companies/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Company not found.' });

    if (req.currentUser!.role === 'SALES_REP') {
      const assigned = await db
        .select()
        .from(campaignCompanyRecords)
        .where(sql`${campaignCompanyRecords.companyId} = ${id} AND ${campaignCompanyRecords.assignedToId} = ${req.currentUser!.id}`)
        .limit(1);
      if (assigned.length === 0) {
        return res.status(403).json({ error: 'Access denied to edit this company.' });
      }
    }

    const body = req.body as Record<string, any>;
    const newName = body.name !== undefined ? String(body.name).trim() : existing.name;
    const newDomain = body.domain !== undefined || body.website !== undefined ? normalizeDomain(body.domain || body.website) : existing.domain;

    const [updated] = await db
      .update(companies)
      .set({
        name: newName,
        normalizedName: normalizeCompanyName(newName),
        website: body.website !== undefined ? normalizeWebsite(body.website) : existing.website,
        domain: newDomain,
        normalizedDomain: newDomain,
        linkedinUrl: body.linkedinUrl !== undefined ? body.linkedinUrl : existing.linkedinUrl,
        normalizedLinkedin: body.linkedinUrl !== undefined ? normalizeLinkedin(body.linkedinUrl) : existing.normalizedLinkedin,
        industry: body.industry !== undefined ? body.industry : existing.industry,
        employeeSize: body.employeeSize !== undefined ? body.employeeSize : existing.employeeSize,
        country: body.country !== undefined ? body.country : existing.country,
        state: body.state !== undefined ? body.state : existing.state,
        city: body.city !== undefined ? body.city : existing.city,
        revenue: body.revenue !== undefined ? body.revenue : existing.revenue,
        timezone: body.timezone !== undefined ? body.timezone : existing.timezone,
        description: body.description !== undefined ? body.description : existing.description,
        isArchived: body.isArchived !== undefined ? Boolean(body.isArchived) : existing.isArchived,
        customFields: body.customFields !== undefined ? body.customFields : existing.customFields,
        updatedAt: new Date(),
      })
      .where(eq(companies.id, id))
      .returning();

    await logAudit({
      user: req.currentUser,
      action: 'COMPANY_UPDATED',
      entity: 'company',
      entityId: id,
      previousValue: { name: existing.name, domain: existing.domain },
      newValue: { name: updated.name, domain: updated.domain },
    });

    res.json({ company: updated });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ error: 'Failed to update company.' });
  }
});

enterpriseRouter.post(
  '/companies/bulk',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { companyIds, action, campaignId } = req.body as {
        companyIds?: number[];
        action?: 'ARCHIVE' | 'UNARCHIVE' | 'ADD_TO_CAMPAIGN' | 'DELETE';
        campaignId?: number;
      };
      if (!Array.isArray(companyIds) || companyIds.length === 0 || !action) {
        return res.status(400).json({ error: 'companyIds and action are required.' });
      }
      const ids = companyIds.map(Number);

      if (action === 'ARCHIVE' || action === 'UNARCHIVE') {
        await db
          .update(companies)
          .set({ isArchived: action === 'ARCHIVE', updatedAt: new Date() })
          .where(inArray(companies.id, ids));
      } else if (action === 'ADD_TO_CAMPAIGN') {
        if (!campaignId) return res.status(400).json({ error: 'campaignId is required.' });
        for (const cid of ids) {
          await db
            .insert(campaignCompanyRecords)
            .values({ campaignId: Number(campaignId), companyId: cid, isApproved: true, status: 'NOT_YET_WORKED' })
            .onConflictDoNothing();
        }
      } else if (action === 'DELETE') {
        if (req.currentUser!.role === 'CAMPAIGN_MANAGER') {
          return res.status(403).json({ error: 'Only Super Admin or Data Manager can permanently delete companies.' });
        }
        await db.delete(companies).where(inArray(companies.id, ids));
      }

      await logAudit({
        user: req.currentUser,
        action: `COMPANIES_BULK_${action}`,
        entity: 'company',
        entityId: ids.join(','),
        newValue: { count: ids.length, campaignId: campaignId || null },
      });

      res.json({ ok: true, count: ids.length });
    } catch (error) {
      console.error('Bulk company action error:', error);
      res.status(500).json({ error: 'Bulk company action failed.' });
    }
  }
);

enterpriseRouter.post(
  '/companies/merge',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { sourceCompanyId, targetCompanyId } = req.body as { sourceCompanyId?: number; targetCompanyId?: number };
      const srcId = Number(sourceCompanyId);
      const tgtId = Number(targetCompanyId);
      if (!srcId || !tgtId || srcId === tgtId) {
        return res.status(400).json({ error: 'Choose two distinct companies to merge.' });
      }

      const [[source], [target]] = await Promise.all([
        db.select().from(companies).where(eq(companies.id, srcId)).limit(1),
        db.select().from(companies).where(eq(companies.id, tgtId)).limit(1),
      ]);
      if (!source || !target) return res.status(404).json({ error: 'Company not found.' });

      await db.update(contacts).set({ companyId: tgtId, updatedAt: new Date() }).where(eq(contacts.companyId, srcId));
      await db.update(activities).set({ companyId: tgtId }).where(eq(activities.companyId, srcId));
      await db.update(followUps).set({ companyId: tgtId, updatedAt: new Date() }).where(eq(followUps.companyId, srcId));
      await db.update(appointments).set({ companyId: tgtId, updatedAt: new Date() }).where(eq(appointments.companyId, srcId));
      await db.update(dataFlags).set({ companyId: tgtId, updatedAt: new Date() }).where(eq(dataFlags.companyId, srcId));
      await db.update(prospectRemarks).set({ companyId: tgtId, updatedAt: new Date() }).where(eq(prospectRemarks.companyId, srcId));
      await db.update(deals).set({ companyId: tgtId, updatedAt: new Date() }).where(eq(deals.companyId, srcId));

      // Move campaign records without violating (campaign_id, company_id) unique constraint
      const srcCCRs = await db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.companyId, srcId));
      const tgtCCRs = await db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.companyId, tgtId));
      const tgtCampaignMap = new Map(tgtCCRs.map((r) => [r.campaignId, r]));

      for (const sCcr of srcCCRs) {
        const existingTgt = tgtCampaignMap.get(sCcr.campaignId);
        if (existingTgt) {
          await db
            .update(activities)
            .set({ campaignCompanyRecordId: existingTgt.id })
            .where(eq(activities.campaignCompanyRecordId, sCcr.id));
          await db
            .update(followUps)
            .set({ campaignCompanyRecordId: existingTgt.id })
            .where(eq(followUps.campaignCompanyRecordId, sCcr.id));
          await db
            .update(appointments)
            .set({ campaignCompanyRecordId: existingTgt.id })
            .where(eq(appointments.campaignCompanyRecordId, sCcr.id));
          await db
            .update(prospectRemarks)
            .set({ campaignCompanyRecordId: existingTgt.id })
            .where(eq(prospectRemarks.campaignCompanyRecordId, sCcr.id));
          await db
            .update(deals)
            .set({ campaignCompanyRecordId: existingTgt.id })
            .where(eq(deals.campaignCompanyRecordId, sCcr.id));
          await db
            .update(campaignContactRecords)
            .set({ campaignCompanyRecordId: existingTgt.id, companyId: tgtId })
            .where(eq(campaignContactRecords.campaignCompanyRecordId, sCcr.id));
          await db.delete(campaignCompanyRecords).where(eq(campaignCompanyRecords.id, sCcr.id));
        } else {
          await db
            .update(campaignCompanyRecords)
            .set({ companyId: tgtId, updatedAt: new Date() })
            .where(eq(campaignCompanyRecords.id, sCcr.id));
        }
      }

      const [mergedTarget] = await db
        .update(companies)
        .set({
          website: target.website || source.website,
          domain: target.domain || source.domain,
          normalizedDomain: target.normalizedDomain || source.normalizedDomain,
          linkedinUrl: target.linkedinUrl || source.linkedinUrl,
          industry: target.industry || source.industry,
          employeeSize: target.employeeSize || source.employeeSize,
          country: target.country || source.country,
          state: target.state || source.state,
          city: target.city || source.city,
          revenue: target.revenue || source.revenue,
          timezone: target.timezone || source.timezone,
          description: target.description || source.description,
          aiScore: Math.max(target.aiScore, source.aiScore),
          fitScore: Math.max(target.fitScore, source.fitScore),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, tgtId))
        .returning();

      await db.delete(companies).where(eq(companies.id, srcId));

      await logAudit({
        user: req.currentUser,
        action: 'COMPANY_MERGED',
        entity: 'company',
        entityId: tgtId,
        previousValue: { deletedSourceId: srcId, sourceName: source.name },
        newValue: { targetName: mergedTarget.name },
      });

      res.json({ company: mergedTarget });
    } catch (error) {
      console.error('Merge companies error:', error);
      res.status(500).json({ error: 'Failed to merge companies.' });
    }
  }
);

enterpriseRouter.patch('/contacts/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const [existing] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Contact not found.' });

    if (req.currentUser!.role === 'SALES_REP') {
      const assigned = await db
        .select()
        .from(campaignCompanyRecords)
        .where(
          sql`${campaignCompanyRecords.companyId} = ${existing.companyId} AND ${campaignCompanyRecords.assignedToId} = ${req.currentUser!.id}`
        )
        .limit(1);
      if (assigned.length === 0) {
        return res.status(403).json({ error: 'Access denied to edit this contact.' });
      }
    }

    const body = req.body as Record<string, any>;
    const fullName = body.fullName !== undefined ? String(body.fullName).trim() : existing.fullName;

    const [updated] = await db
      .update(contacts)
      .set({
        fullName,
        jobTitle: body.jobTitle !== undefined ? body.jobTitle : existing.jobTitle,
        department: body.department !== undefined ? body.department : existing.department,
        seniority: body.seniority !== undefined ? body.seniority : existing.seniority,
        workEmail: body.workEmail !== undefined ? body.workEmail : existing.workEmail,
        normalizedEmail: body.workEmail !== undefined ? normalizeEmail(body.workEmail) : existing.normalizedEmail,
        phone: body.phone !== undefined ? body.phone : existing.phone,
        normalizedPhone: body.phone !== undefined ? normalizePhone(body.phone) : existing.normalizedPhone,
        linkedinUrl: body.linkedinUrl !== undefined ? body.linkedinUrl : existing.linkedinUrl,
        normalizedLinkedin: body.linkedinUrl !== undefined ? normalizeLinkedin(body.linkedinUrl) : existing.normalizedLinkedin,
        doNotContact: body.doNotContact !== undefined ? Boolean(body.doNotContact) : existing.doNotContact,
        isArchived: body.isArchived !== undefined ? Boolean(body.isArchived) : existing.isArchived,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, id))
      .returning();

    await logAudit({
      user: req.currentUser,
      action: 'CONTACT_UPDATED',
      entity: 'contact',
      entityId: id,
      previousValue: { fullName: existing.fullName, workEmail: existing.workEmail, phone: existing.phone },
      newValue: { fullName: updated.fullName, workEmail: updated.workEmail, phone: updated.phone },
    });

    res.json({ contact: updated });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact.' });
  }
});

enterpriseRouter.post(
  '/contacts/bulk',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { contactIds, action } = req.body as { contactIds?: number[]; action?: 'ARCHIVE' | 'MARK_DNC' | 'DELETE' };
      if (!Array.isArray(contactIds) || contactIds.length === 0 || !action) {
        return res.status(400).json({ error: 'contactIds and action are required.' });
      }
      const ids = contactIds.map(Number);

      if (action === 'ARCHIVE') {
        await db.update(contacts).set({ isArchived: true, updatedAt: new Date() }).where(inArray(contacts.id, ids));
      } else if (action === 'MARK_DNC') {
        const rows = await db.select().from(contacts).where(inArray(contacts.id, ids));
        await db.update(contacts).set({ doNotContact: true, updatedAt: new Date() }).where(inArray(contacts.id, ids));
        for (const ct of rows) {
          if (ct.normalizedEmail) {
            await db
              .insert(dncSuppression)
              .values({
                type: 'EMAIL',
                value: ct.normalizedEmail,
                rawValue: ct.workEmail || ct.normalizedEmail,
                reason: 'Bulk marked Do Not Contact',
                addedById: req.currentUser!.id,
              })
              .onConflictDoNothing();
          }
        }
      } else if (action === 'DELETE') {
        if (req.currentUser!.role === 'CAMPAIGN_MANAGER') {
          return res.status(403).json({ error: 'Only Super Admin or Data Manager can delete contacts.' });
        }
        await db.delete(contacts).where(inArray(contacts.id, ids));
      }

      res.json({ ok: true, count: ids.length });
    } catch (error) {
      console.error('Bulk contacts action error:', error);
      res.status(500).json({ error: 'Bulk contact action failed.' });
    }
  }
);

enterpriseRouter.post(
  '/contacts/merge',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { sourceContactId, targetContactId } = req.body as { sourceContactId?: number; targetContactId?: number };
      const srcId = Number(sourceContactId);
      const tgtId = Number(targetContactId);
      if (!srcId || !tgtId || srcId === tgtId) {
        return res.status(400).json({ error: 'Select two distinct contacts to merge.' });
      }

      const [[source], [target]] = await Promise.all([
        db.select().from(contacts).where(eq(contacts.id, srcId)).limit(1),
        db.select().from(contacts).where(eq(contacts.id, tgtId)).limit(1),
      ]);
      if (!source || !target) return res.status(404).json({ error: 'Contact not found.' });

      await db.update(activities).set({ contactId: tgtId }).where(eq(activities.contactId, srcId));
      await db.update(followUps).set({ contactId: tgtId, updatedAt: new Date() }).where(eq(followUps.contactId, srcId));
      await db.update(appointments).set({ contactId: tgtId, updatedAt: new Date() }).where(eq(appointments.contactId, srcId));
      await db.update(deals).set({ contactId: tgtId, updatedAt: new Date() }).where(eq(deals.contactId, srcId));
      await db.delete(campaignContactRecords).where(eq(campaignContactRecords.contactId, srcId));

      const [merged] = await db
        .update(contacts)
        .set({
          jobTitle: target.jobTitle || source.jobTitle,
          department: target.department || source.department,
          workEmail: target.workEmail || source.workEmail,
          normalizedEmail: target.normalizedEmail || source.normalizedEmail,
          phone: target.phone || source.phone,
          normalizedPhone: target.normalizedPhone || source.normalizedPhone,
          linkedinUrl: target.linkedinUrl || source.linkedinUrl,
          normalizedLinkedin: target.normalizedLinkedin || source.normalizedLinkedin,
          doNotContact: target.doNotContact || source.doNotContact,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, tgtId))
        .returning();

      await db.delete(contacts).where(eq(contacts.id, srcId));

      await logAudit({
        user: req.currentUser,
        action: 'CONTACT_MERGED',
        entity: 'contact',
        entityId: tgtId,
        previousValue: { deletedSourceId: srcId, sourceName: source.fullName },
        newValue: { targetName: merged.fullName },
      });

      res.json({ contact: merged });
    } catch (error) {
      console.error('Merge contacts error:', error);
      res.status(500).json({ error: 'Failed to merge contacts.' });
    }
  }
);

// ==================== REP DATA CORRECTION / ENRICHMENT FLAGS ====================
enterpriseRouter.get('/data-flags', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const [flags, allCompanies, allContacts, allUsers] = await Promise.all([
      db.select().from(dataFlags).orderBy(desc(dataFlags.createdAt)),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(users),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
    const contactMap = new Map(allContacts.map((c) => [c.id, c.fullName]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const visible = flags.filter((f) => user.role !== 'SALES_REP' || f.reportedById === user.id);

    res.json({
      flags: visible.map((f) => ({
        ...f,
        companyName: companyMap.get(f.companyId) || 'Company',
        contactName: f.contactId ? contactMap.get(f.contactId) || null : null,
        reportedByName: userMap.get(f.reportedById) || 'Rep',
        resolvedByName: f.resolvedById ? userMap.get(f.resolvedById) || null : null,
      })),
    });
  } catch (error) {
    console.error('List data flags error:', error);
    res.status(500).json({ error: 'Failed to load data flags.' });
  }
});

enterpriseRouter.post('/data-flags', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { campaignCompanyRecordId, companyId, contactId, issueType, proposedFix, notes } = req.body as Record<string, any>;
    if (!companyId || !issueType) {
      return res.status(400).json({ error: 'companyId and issueType are required.' });
    }

    const [created] = await db
      .insert(dataFlags)
      .values({
        campaignCompanyRecordId: campaignCompanyRecordId ? Number(campaignCompanyRecordId) : null,
        companyId: Number(companyId),
        contactId: contactId ? Number(contactId) : null,
        reportedById: req.currentUser!.id,
        issueType: String(issueType),
        proposedFix: proposedFix ? String(proposedFix).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status: 'OPEN',
      })
      .returning();

    const managers = await db.select().from(users);
    for (const m of managers.filter((u) => ['DATA_MANAGER', 'SUPER_ADMIN'].includes(u.role) && u.isActive)) {
      await createNotification({
        userId: m.id,
        type: 'DATA_FLAG_REPORTED',
        title: `Data Quality Flag: ${created.issueType}`,
        message: `${req.currentUser!.fullName} flagged a record for enrichment/review.`,
        entityType: 'data_flag',
        entityId: created.id,
        linkPath: '/data-requests',
      });
    }

    res.status(201).json({ flag: created });
  } catch (error) {
    console.error('Create data flag error:', error);
    res.status(500).json({ error: 'Failed to submit data quality flag.' });
  }
});

enterpriseRouter.patch(
  '/data-flags/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body as { status?: string };
      const [existing] = await db.select().from(dataFlags).where(eq(dataFlags.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Data flag not found.' });

      const [updated] = await db
        .update(dataFlags)
        .set({
          status: status || 'RESOLVED',
          resolvedById: req.currentUser!.id,
          updatedAt: new Date(),
        })
        .where(eq(dataFlags.id, id))
        .returning();

      await createNotification({
        userId: existing.reportedById,
        type: 'DATA_FLAG_RESOLVED',
        title: `Data Flag ${updated.status}`,
        message: `Your data quality flag (${existing.issueType}) was marked ${updated.status}.`,
        entityType: 'data_flag',
        entityId: id,
        linkPath: '/data-requests',
      });

      res.json({ flag: updated });
    } catch (error) {
      console.error('Resolve data flag error:', error);
      res.status(500).json({ error: 'Failed to update data flag.' });
    }
  }
);

// ==================== SLA / STALE LEAD DETECTION & AUTO-RECLAIM ====================
enterpriseRouter.get(
  '/distribution/stale',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req, res) => {
    try {
      const daysIdle = Math.max(1, Number(req.query.daysIdle || 5));
      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(Date.now() - daysIdle * 24 * 60 * 60 * 1000);

      const [ccrRows, allCompanies, allUsers] = await Promise.all([
        db.select().from(campaignCompanyRecords),
        db.select().from(companies),
        db.select().from(users),
      ]);

      const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
      const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

      const staleRecords = ccrRows
        .filter((r) => {
          if (!r.assignedToId || r.status !== 'NOT_YET_WORKED') return false;
          const pastDue = Boolean(r.dueDate && r.dueDate < today);
          const staleAssigned = Boolean(r.assignedAt && new Date(r.assignedAt) < cutoff);
          return pastDue || staleAssigned;
        })
        .map((r) => ({
          id: r.id,
          campaignId: r.campaignId,
          companyId: r.companyId,
          companyName: companyMap.get(r.companyId) || 'Company',
          assignedToId: r.assignedToId,
          assignedToName: r.assignedToId ? userMap.get(r.assignedToId) || 'Rep' : null,
          assignedAt: r.assignedAt,
          dueDate: r.dueDate,
          reason: r.dueDate && r.dueDate < today ? `Past due date (${r.dueDate})` : `Untouched > ${daysIdle} days`,
        }));

      res.json({ staleRecords });
    } catch (error) {
      console.error('Check stale records error:', error);
      res.status(500).json({ error: 'Failed to inspect stale records.' });
    }
  }
);

enterpriseRouter.post(
  '/distribution/reclaim-stale',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { recordIds, action = 'RECLAIM' } = req.body as {
        recordIds?: number[];
        action?: 'RECLAIM' | 'NOTIFY';
      };
      if (!Array.isArray(recordIds) || recordIds.length === 0) {
        return res.status(400).json({ error: 'Select at least one stale record.' });
      }

      const records = await db
        .select()
        .from(campaignCompanyRecords)
        .where(inArray(campaignCompanyRecords.id, recordIds.map(Number)));

      if (action === 'NOTIFY') {
        const repIds = Array.from(new Set(records.map((r) => r.assignedToId).filter(Boolean))) as number[];
        for (const repId of repIds) {
          const cnt = records.filter((r) => r.assignedToId === repId).length;
          await createNotification({
            userId: repId,
            type: 'SLA_WARNING',
            title: `SLA Reminder: ${cnt} Untouched Record(s)`,
            message: `${cnt} assigned prospect(s) are past SLA deadline. Please begin outreach or notify your manager.`,
            linkPath: '/workspace',
          });
        }
        await dispatchExternalAlert({
          event: 'SLA_ALERT',
          title: 'CadenceOps SLA Reminder Issued',
          message: `${req.currentUser!.fullName} sent SLA alerts for ${records.length} untouched record(s).`,
        });
        return res.json({ notifiedReps: repIds.length, count: records.length });
      }

      for (const rec of records) {
        if (!rec.assignedToId) continue;
        await db
          .update(assignments)
          .set({ status: 'REASSIGNED' })
          .where(sql`${assignments.campaignCompanyRecordId} = ${rec.id} AND ${assignments.status} = 'ACTIVE'`);

        await db
          .update(campaignCompanyRecords)
          .set({
            assignedToId: null,
            assignedById: null,
            assignedAt: null,
            dueDate: null,
            updatedAt: new Date(),
          })
          .where(eq(campaignCompanyRecords.id, rec.id));

        await db.insert(assignmentHistory).values({
          campaignId: rec.campaignId,
          campaignCompanyRecordId: rec.id,
          previousAssigneeId: rec.assignedToId,
          newAssigneeId: req.currentUser!.id,
          changedById: req.currentUser!.id,
          action: 'RECLAIMED_SLA',
          reason: 'Returned to unassigned campaign pool due to SLA inactivity',
        });
      }

      await logAudit({
        user: req.currentUser,
        action: 'STALE_RECORDS_RECLAIMED',
        entity: 'campaign_company_record',
        entityId: recordIds.join(','),
        newValue: { reclaimedCount: records.length },
      });

      res.json({ reclaimedCount: records.length });
    } catch (error) {
      console.error('Reclaim stale error:', error);
      res.status(500).json({ error: 'Failed to process stale records.' });
    }
  }
);

// ==================== SAVED FILTER VIEWS ====================
enterpriseRouter.get('/saved-views', requireAuth, async (req: AuthRequest, res) => {
  try {
    const page = String(req.query.page || '');
    const rows = await db.select().from(savedViews).where(eq(savedViews.userId, req.currentUser!.id));
    res.json({ views: page ? rows.filter((r) => r.page === page) : rows });
  } catch (error) {
    console.error('List saved views error:', error);
    res.status(500).json({ error: 'Failed to load saved views.' });
  }
});

enterpriseRouter.post('/saved-views', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { page, name, filters } = req.body as { page?: string; name?: string; filters?: Record<string, string> };
    if (!page || !name || !filters) {
      return res.status(400).json({ error: 'page, name, and filters are required.' });
    }
    const [created] = await db
      .insert(savedViews)
      .values({ userId: req.currentUser!.id, page, name: name.trim(), filters })
      .returning();
    res.status(201).json({ view: created });
  } catch (error) {
    console.error('Save view error:', error);
    res.status(500).json({ error: 'Failed to save filter view.' });
  }
});

enterpriseRouter.delete('/saved-views/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .delete(savedViews)
      .where(sql`${savedViews.id} = ${id} AND ${savedViews.userId} = ${req.currentUser!.id}`);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete saved view error:', error);
    res.status(500).json({ error: 'Failed to delete saved view.' });
  }
});

// ==================== DAILY REP TARGETS ====================
enterpriseRouter.patch(
  '/employees/:id/targets',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const { dailyCallTarget, dailyOutreachTarget } = req.body as {
        dailyCallTarget?: number;
        dailyOutreachTarget?: number;
      };
      const [updated] = await db
        .update(users)
        .set({
          dailyCallTarget: Math.max(1, Number(dailyCallTarget || 35)),
          dailyOutreachTarget: Math.max(1, Number(dailyOutreachTarget || 60)),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      if (!updated) return res.status(404).json({ error: 'Employee not found.' });
      res.json({ ok: true, dailyCallTarget: updated.dailyCallTarget, dailyOutreachTarget: updated.dailyOutreachTarget });
    } catch (error) {
      console.error('Update targets error:', error);
      res.status(500).json({ error: 'Failed to update daily targets.' });
    }
  }
);

// ==================== OPPORTUNITY / DEAL PIPELINE ====================
const VALID_DEAL_STAGES = new Set(['DISCOVERY', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST']);
const STAGE_DEFAULT_PROB: Record<string, number> = {
  DISCOVERY: 20,
  PROPOSAL: 50,
  NEGOTIATION: 75,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
};

enterpriseRouter.get('/deals', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : null;
    const ownerId = req.query.ownerId ? Number(req.query.ownerId) : null;
    const stage = req.query.stage ? String(req.query.stage) : null;
    const search = String(req.query.search || '').trim().toLowerCase();

    const [allDeals, allCompanies, allContacts, allCampaigns, allUsers, allCCRs] = await Promise.all([
      db.select().from(deals).orderBy(desc(deals.updatedAt)),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaigns),
      db.select().from(users),
      db.select().from(campaignCompanyRecords),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
    const contactMap = new Map(allContacts.map((c) => [c.id, c]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const assignedCompanyIds = new Set(
      allCCRs.filter((r) => r.assignedToId === user.id).map((r) => r.companyId)
    );

    const visibleDeals = allDeals.filter((d) => {
      if (user.role === 'SALES_REP' && d.ownerId !== user.id && !assignedCompanyIds.has(d.companyId)) return false;
      if (campaignId && d.campaignId !== campaignId) return false;
      if (ownerId && user.role !== 'SALES_REP' && d.ownerId !== ownerId) return false;
      if (stage && d.stage !== stage) return false;
      if (search) {
        const comp = companyMap.get(d.companyId);
        const hay = `${d.dealCode} ${d.title} ${comp?.name || ''} ${d.notes || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const openDeals = visibleDeals.filter((d) => !['CLOSED_WON', 'CLOSED_LOST'].includes(d.stage));
    const wonDeals = visibleDeals.filter((d) => d.stage === 'CLOSED_WON');
    const lostDeals = visibleDeals.filter((d) => d.stage === 'CLOSED_LOST');

    const openPipelineValue = openDeals.reduce((sum, d) => sum + d.amount, 0);
    const weightedPipelineValue = Math.round(
      openDeals.reduce((sum, d) => sum + (d.amount * d.probability) / 100, 0)
    );
    const closedWonValue = wonDeals.reduce((sum, d) => sum + d.amount, 0);
    const closedTotal = wonDeals.length + lostDeals.length;
    const winRate = closedTotal > 0 ? Math.round((wonDeals.length / closedTotal) * 100) : 0;

    res.json({
      deals: visibleDeals.map((d) => ({
        ...d,
        companyName: companyMap.get(d.companyId)?.name || 'Company',
        companyDomain: companyMap.get(d.companyId)?.domain || null,
        contactName: d.contactId ? contactMap.get(d.contactId)?.fullName || null : null,
        campaignName: d.campaignId ? campaignMap.get(d.campaignId)?.name || null : null,
        ownerName: userMap.get(d.ownerId)?.fullName || 'Owner',
      })),
      summary: {
        totalDeals: visibleDeals.length,
        openDealsCount: openDeals.length,
        openPipelineValue,
        weightedPipelineValue,
        closedWonValue,
        wonCount: wonDeals.length,
        lostCount: lostDeals.length,
        winRate,
      },
      options: {
        companies: allCompanies
          .filter((c) => !c.isArchived && (user.role !== 'SALES_REP' || assignedCompanyIds.has(c.id)))
          .map((c) => ({ id: c.id, name: c.name })),
        campaigns: allCampaigns.map((c) => ({ id: c.id, name: c.name })),
        owners: allUsers
          .filter((u) => u.isActive && ['SALES_REP', 'CAMPAIGN_MANAGER', 'SUPER_ADMIN'].includes(u.role))
          .map((u) => ({ id: u.id, fullName: u.fullName })),
      },
    });
  } catch (error) {
    console.error('List deals error:', error);
    res.status(500).json({ error: 'Failed to load deal pipeline.' });
  }
});

enterpriseRouter.post('/deals', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const body = req.body as Record<string, any>;
    const title = String(body.title || '').trim();
    const companyId = Number(body.companyId);
    if (!title || !companyId) {
      return res.status(400).json({ error: 'Deal title and company are required.' });
    }

    if (user.role === 'SALES_REP') {
      const assigned = await db
        .select()
        .from(campaignCompanyRecords)
        .where(sql`${campaignCompanyRecords.companyId} = ${companyId} AND ${campaignCompanyRecords.assignedToId} = ${user.id}`)
        .limit(1);
      if (assigned.length === 0) {
        return res.status(403).json({ error: 'You can only create deals for companies assigned to you.' });
      }
    }

    const stage = VALID_DEAL_STAGES.has(String(body.stage || '').toUpperCase())
      ? String(body.stage).toUpperCase()
      : 'DISCOVERY';
    const probability =
      body.probability !== undefined && body.probability !== ''
        ? Math.max(0, Math.min(100, Number(body.probability)))
        : STAGE_DEFAULT_PROB[stage] ?? 20;
    const amount = Math.max(0, Math.round(Number(body.amount || 0)));
    const countRows = await db.select({ count: sql<number>`count(*)::int` }).from(deals);
    const dealCode = `DEAL-${new Date().getFullYear()}-${String((countRows[0]?.count ?? 0) + 1).padStart(3, '0')}-${Math.floor(10 + Math.random() * 89)}`;

    const ownerId =
      user.role === 'SALES_REP' ? user.id : body.ownerId ? Number(body.ownerId) : user.id;

    const [created] = await db
      .insert(deals)
      .values({
        dealCode,
        title,
        campaignId: body.campaignId ? Number(body.campaignId) : null,
        campaignCompanyRecordId: body.campaignCompanyRecordId ? Number(body.campaignCompanyRecordId) : null,
        companyId,
        contactId: body.contactId ? Number(body.contactId) : null,
        ownerId,
        stage,
        amount,
        probability,
        expectedCloseDate: body.expectedCloseDate || null,
        lossReason: stage === 'CLOSED_LOST' ? body.lossReason || null : null,
        notes: body.notes || null,
        closedAt: stage === 'CLOSED_WON' || stage === 'CLOSED_LOST' ? new Date() : null,
      })
      .returning();

    await logAudit({
      user,
      action: 'DEAL_CREATED',
      entity: 'deal',
      entityId: created.id,
      newValue: { dealCode: created.dealCode, title: created.title, stage: created.stage, amount: created.amount },
    });

    res.status(201).json({ deal: created });
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ error: 'Failed to create deal.' });
  }
});

enterpriseRouter.patch('/deals/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Deal not found.' });

    const isManager = ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);
    if (!isManager && existing.ownerId !== user.id) {
      return res.status(403).json({ error: 'You can only update your own deals.' });
    }

    const body = req.body as Record<string, any>;
    const nextStage =
      body.stage && VALID_DEAL_STAGES.has(String(body.stage).toUpperCase())
        ? String(body.stage).toUpperCase()
        : existing.stage;
    const stageChanged = nextStage !== existing.stage;
    const nextProbability =
      body.probability !== undefined && body.probability !== ''
        ? Math.max(0, Math.min(100, Number(body.probability)))
        : stageChanged
          ? STAGE_DEFAULT_PROB[nextStage] ?? existing.probability
          : existing.probability;

    const [updated] = await db
      .update(deals)
      .set({
        title: body.title !== undefined ? String(body.title).trim() || existing.title : existing.title,
        stage: nextStage,
        amount: body.amount !== undefined ? Math.max(0, Math.round(Number(body.amount))) : existing.amount,
        probability: nextProbability,
        expectedCloseDate: body.expectedCloseDate !== undefined ? body.expectedCloseDate || null : existing.expectedCloseDate,
        lossReason: nextStage === 'CLOSED_LOST' ? (body.lossReason !== undefined ? body.lossReason : existing.lossReason) : null,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        ownerId: isManager && body.ownerId ? Number(body.ownerId) : existing.ownerId,
        closedAt:
          nextStage === 'CLOSED_WON' || nextStage === 'CLOSED_LOST'
            ? existing.closedAt || new Date()
            : null,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id))
      .returning();

    if (stageChanged && nextStage === 'CLOSED_WON') {
      const managers = await db.select().from(users);
      for (const m of managers.filter((u) => ['SUPER_ADMIN', 'CAMPAIGN_MANAGER'].includes(u.role) && u.isActive && u.id !== user.id)) {
        await createNotification({
          userId: m.id,
          type: 'DEAL_CLOSED_WON',
          title: `Deal Won: ${updated.title}`,
          message: `${user.fullName} closed ${updated.dealCode} for $${updated.amount.toLocaleString()}.`,
          entityType: 'deal',
          entityId: updated.id,
          linkPath: '/pipeline',
        });
      }
    }

    await logAudit({
      user,
      action: 'DEAL_UPDATED',
      entity: 'deal',
      entityId: id,
      previousValue: { stage: existing.stage, amount: existing.amount },
      newValue: { stage: updated.stage, amount: updated.amount },
    });

    res.json({ deal: updated });
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ error: 'Failed to update deal.' });
  }
});

enterpriseRouter.delete('/deals/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Deal not found.' });

    const isManager = ['SUPER_ADMIN', 'CAMPAIGN_MANAGER'].includes(user.role);
    if (!isManager && existing.ownerId !== user.id) {
      return res.status(403).json({ error: 'You can only delete your own deals.' });
    }

    await db.delete(deals).where(eq(deals.id, id));
    await logAudit({
      user,
      action: 'DEAL_DELETED',
      entity: 'deal',
      entityId: id,
      previousValue: { dealCode: existing.dealCode, title: existing.title, amount: existing.amount },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete deal error:', error);
    res.status(500).json({ error: 'Failed to delete deal.' });
  }
});

// ==================== GLOBAL QUICK SEARCH (Ctrl+K) ====================
enterpriseRouter.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) {
      return res.json({ results: { campaigns: [], prospects: [], companies: [], contacts: [], deals: [] } });
    }

    const [allCampaigns, allCompanies, allContacts, allCCRs, allDeals] = await Promise.all([
      db.select().from(campaigns),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaignCompanyRecords),
      db.select().from(deals),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
    const isRep = user.role === 'SALES_REP';
    const repCompanyIds = new Set(allCCRs.filter((r) => r.assignedToId === user.id).map((r) => r.companyId));
    const repCampaignIds = new Set(allCCRs.filter((r) => r.assignedToId === user.id).map((r) => r.campaignId));

    const matchedCampaigns = allCampaigns
      .filter((c) => (!isRep || repCampaignIds.has(c.id)) && `${c.name} ${c.campaignCode} ${c.clientName || ''}`.toLowerCase().includes(q))
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name, campaignCode: c.campaignCode, status: c.status }));

    const matchedProspects = allCCRs
      .filter((r) => {
        if (isRep && r.assignedToId !== user.id) return false;
        const comp = companyMap.get(r.companyId);
        const cmp = campaignMap.get(r.campaignId);
        return `${comp?.name || ''} ${comp?.domain || ''} ${cmp?.name || ''} ${r.prospectSummary || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map((r) => ({
        recordId: r.id,
        companyName: companyMap.get(r.companyId)?.name || 'Company',
        campaignName: campaignMap.get(r.campaignId)?.name || 'Campaign',
        status: r.status,
      }));

    const matchedCompanies = isRep
      ? []
      : allCompanies
          .filter((c) => !c.isArchived && `${c.name} ${c.domain || ''} ${c.industry || ''}`.toLowerCase().includes(q))
          .slice(0, 5)
          .map((c) => ({ id: c.id, name: c.name, domain: c.domain, industry: c.industry }));

    const matchedContacts = allContacts
      .filter((ct) => {
        if (ct.isArchived) return false;
        if (isRep && !repCompanyIds.has(ct.companyId)) return false;
        const comp = companyMap.get(ct.companyId);
        return `${ct.fullName} ${ct.workEmail || ''} ${ct.jobTitle || ''} ${comp?.name || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 5)
      .map((ct) => ({
        id: ct.id,
        fullName: ct.fullName,
        jobTitle: ct.jobTitle,
        workEmail: ct.workEmail,
        companyName: companyMap.get(ct.companyId)?.name || '',
      }));

    const matchedDeals = allDeals
      .filter((d) => {
        if (isRep && d.ownerId !== user.id && !repCompanyIds.has(d.companyId)) return false;
        const comp = companyMap.get(d.companyId);
        return `${d.dealCode} ${d.title} ${comp?.name || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 5)
      .map((d) => ({
        id: d.id,
        dealCode: d.dealCode,
        title: d.title,
        stage: d.stage,
        amount: d.amount,
        companyName: companyMap.get(d.companyId)?.name || '',
      }));

    res.json({
      results: {
        campaigns: matchedCampaigns,
        prospects: matchedProspects,
        companies: matchedCompanies,
        contacts: matchedContacts,
        deals: matchedDeals,
      },
    });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ error: 'Search failed.' });
  }
});

