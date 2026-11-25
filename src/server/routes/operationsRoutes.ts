import { Router } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activities,
  appSettings,
  appointments,
  assignmentHistory,
  campaignCompanyRecords,
  campaignContactRecords,
  campaigns,
  companies,
  contacts,
  dataFlags,
  dataRequests,
  dncSuppression,
  followUps,
  outreachTemplates,
  prospectRemarks,
  sequenceEnrollments,
  sequences,
  sequenceSteps,
  users,
} from '../../db/schema.ts';
import { AuthRequest, createNotification, logAudit, requireAuth, requireRole } from '../auth.ts';
import { dispatchExternalAlert } from '../integrations.ts';
import { normalizeEmail, normalizePhone } from '../normalization.ts';
import { DEFAULT_OUTCOME_RULES, OutcomeRule, resolveStatusFromOutcome } from '../workflow.ts';

export const operationsRouter = Router();

// ==================== PROSPECTING WORKSPACE ====================
operationsRouter.get('/workspace/records', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const filterPreset = req.query.preset ? String(req.query.preset) : null;
    const search = String(req.query.search || '').trim().toLowerCase();

    const [allCCRs, allCompanies, allContacts, allCampaigns, allUsers, allFollowUps, allActivities, allRemarks] = await Promise.all([
      db.select().from(campaignCompanyRecords).orderBy(desc(campaignCompanyRecords.updatedAt)),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaigns),
      db.select().from(users),
      db.select().from(followUps),
      db.select().from(activities).orderBy(desc(activities.createdAt)),
      db.select().from(prospectRemarks).orderBy(desc(prospectRemarks.isPinned), desc(prospectRemarks.createdAt)),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const today = new Date().toISOString().slice(0, 10);
    const duePendingRecordIds = new Set(
      allFollowUps
        .filter((f) => (f.status === 'PENDING' || f.status === 'OVERDUE') && f.followUpDate <= today)
        .map((f) => f.campaignCompanyRecordId)
    );

    const filtered = allCCRs.filter((r) => {
      // Strict Sales Rep isolation: Sales reps ONLY see records assigned to them
      if (user.role === 'SALES_REP' && r.assignedToId !== user.id) return false;
      if (campaignId && r.campaignId !== campaignId) return false;
      if (statusFilter && r.status !== statusFilter) return false;

      if (filterPreset === 'NOT_YET_WORKED' && r.status !== 'NOT_YET_WORKED') return false;
      if (filterPreset === 'WORKED' && r.status === 'NOT_YET_WORKED') return false;
      if (filterPreset === 'DUE_TODAY' && !duePendingRecordIds.has(r.id) && r.dueDate !== today) return false;
      if (filterPreset === 'INTERESTED' && !['INTERESTED', 'QUALIFIED_LEAD'].includes(r.status)) return false;
      if (filterPreset === 'NOT_INTERESTED' && !['NOT_INTERESTED', 'NOT_QUALIFIED', 'DO_NOT_CONTACT'].includes(r.status)) return false;
      if (filterPreset === 'FOLLOW_UP' && r.status !== 'FOLLOW_UP_REQUIRED') return false;
      if (filterPreset === 'APPOINTMENT' && r.status !== 'APPOINTMENT_BOOKED') return false;

      if (search) {
        const comp = companyMap.get(r.companyId);
        const compContacts = allContacts.filter((ct) => ct.companyId === r.companyId);
        const contactStr = compContacts.map((ct) => `${ct.fullName} ${ct.workEmail || ''} ${ct.jobTitle || ''}`).join(' ');
        const remarkStr = allRemarks
          .filter((rm) => rm.campaignCompanyRecordId === r.id)
          .map((rm) => rm.content)
          .join(' ');
        const hay = `${comp?.name || ''} ${comp?.domain || ''} ${contactStr} ${campaignMap.get(r.campaignId)?.name || ''} ${r.prospectSummary || ''} ${remarkStr}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const rows = filtered.map((r) => {
      const comp = companyMap.get(r.companyId);
      const compContacts = allContacts.filter((ct) => ct.companyId === r.companyId);
      const primaryContact = compContacts[0] || null;
      const pendingFup = allFollowUps
        .filter((f) => f.campaignCompanyRecordId === r.id && (f.status === 'PENDING' || f.status === 'OVERDUE'))
        .sort((a, b) => a.followUpDate.localeCompare(b.followUpDate))[0];
      const latestAct = allActivities.find((a) => a.campaignCompanyRecordId === r.id);
      const recRemarks = allRemarks.filter((rm) => rm.campaignCompanyRecordId === r.id);
      const highlightRemark = recRemarks[0] || null;

      return {
        id: r.id,
        campaignId: r.campaignId,
        campaignName: campaignMap.get(r.campaignId)?.name || 'Campaign',
        companyId: r.companyId,
        companyName: comp?.name || 'Company',
        website: comp?.website,
        domain: comp?.domain,
        companyLinkedinUrl: comp?.linkedinUrl,
        industry: comp?.industry,
        country: comp?.country,
        aiScore: comp?.aiScore ?? 0,
        fitScore: comp?.fitScore ?? 0,
        primaryContact: primaryContact
          ? {
              id: primaryContact.id,
              fullName: primaryContact.fullName,
              jobTitle: primaryContact.jobTitle,
              workEmail: primaryContact.workEmail,
              phone: primaryContact.phone,
              linkedinUrl: primaryContact.linkedinUrl,
            }
          : null,
        contactsCount: compContacts.length,
        assignedToId: r.assignedToId,
        assignedToName: r.assignedToId ? userMap.get(r.assignedToId) || null : null,
        assignedAt: r.assignedAt,
        dueDate: r.dueDate,
        status: r.status,
        prospectSummary: r.prospectSummary || null,
        prospectSentiment: r.prospectSentiment || null,
        remarksCount: recRemarks.length,
        latestRemark: highlightRemark
          ? {
              id: highlightRemark.id,
              category: highlightRemark.category,
              content: highlightRemark.content,
              isPinned: highlightRemark.isPinned,
              authorName: userMap.get(highlightRemark.authorId) || 'Rep',
              createdAt: highlightRemark.createdAt,
            }
          : null,
        lastActivityAt: r.lastActivityAt,
        lastActivitySummary: latestAct ? `${latestAct.channel} · ${latestAct.activityDate}` : null,
        nextFollowUp: pendingFup ? `${pendingFup.followUpDate} ${pendingFup.followUpTime}` : null,
      };
    });

    res.json({ records: rows });
  } catch (error) {
    console.error('Workspace records error:', error);
    res.status(500).json({ error: 'Failed to load prospecting workspace.' });
  }
});

operationsRouter.get('/workspace/records/:recordId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const recordId = Number(req.params.recordId);
    const user = req.currentUser!;

    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, recordId))
      .limit(1);
    if (!ccr) return res.status(404).json({ error: 'Prospect record not found.' });

    if (user.role === 'SALES_REP' && ccr.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: This record is not assigned to you.' });
    }

    const [
      [company],
      [campaign],
      companyContacts,
      recordActivities,
      recordFollowUps,
      recordAppointments,
      assignHist,
      allUsers,
      allTemplates,
      allSeqs,
      allSteps,
      enrollments,
      companyFlags,
      recordRemarks,
    ] = await Promise.all([
      db.select().from(companies).where(eq(companies.id, ccr.companyId)).limit(1),
      db.select().from(campaigns).where(eq(campaigns.id, ccr.campaignId)).limit(1),
      db.select().from(contacts).where(eq(contacts.companyId, ccr.companyId)),
      db
        .select()
        .from(activities)
        .where(eq(activities.campaignCompanyRecordId, ccr.id))
        .orderBy(desc(activities.activityDate), desc(activities.activityTime), desc(activities.createdAt)),
      db
        .select()
        .from(followUps)
        .where(eq(followUps.campaignCompanyRecordId, ccr.id))
        .orderBy(desc(followUps.followUpDate)),
      db
        .select()
        .from(appointments)
        .where(eq(appointments.campaignCompanyRecordId, ccr.id))
        .orderBy(desc(appointments.appointmentDate)),
      db
        .select()
        .from(assignmentHistory)
        .where(eq(assignmentHistory.campaignCompanyRecordId, ccr.id))
        .orderBy(desc(assignmentHistory.createdAt)),
      db.select().from(users),
      db.select().from(outreachTemplates),
      db.select().from(sequences),
      db.select().from(sequenceSteps).orderBy(sequenceSteps.stepOrder),
      db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.campaignCompanyRecordId, ccr.id)),
      db.select().from(dataFlags).where(eq(dataFlags.companyId, ccr.companyId)).orderBy(desc(dataFlags.createdAt)),
      db
        .select()
        .from(prospectRemarks)
        .where(eq(prospectRemarks.campaignCompanyRecordId, ccr.id))
        .orderBy(desc(prospectRemarks.isPinned), desc(prospectRemarks.createdAt)),
    ]);

    const userObjMap = new Map(allUsers.map((u) => [u.id, u]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));
    const contactMap = new Map(companyContacts.map((c) => [c.id, c.fullName]));
    const seqMap = new Map(allSeqs.map((s) => [s.id, s]));

    res.json({
      record: ccr,
      company,
      campaign,
      contacts: companyContacts.filter((ct) => !ct.isArchived),
      templates: allTemplates.filter((t) => t.isActive && (!t.campaignId || t.campaignId === ccr.campaignId)),
      availableSequences: allSeqs
        .filter((s) => s.isActive && (!s.campaignId || s.campaignId === ccr.campaignId))
        .map((s) => ({ ...s, steps: allSteps.filter((st) => st.sequenceId === s.id) })),
      sequenceEnrollments: enrollments.map((e) => ({
        ...e,
        sequenceName: seqMap.get(e.sequenceId)?.name || 'Sequence',
        steps: allSteps.filter((st) => st.sequenceId === e.sequenceId),
      })),
      dataFlags: companyFlags,
      remarks: recordRemarks.map((rm) => ({
        ...rm,
        authorName: userObjMap.get(rm.authorId)?.fullName || 'Team Member',
        authorRole: userObjMap.get(rm.authorId)?.role || 'SALES_REP',
        contactName: rm.contactId ? contactMap.get(rm.contactId) || null : null,
      })),
      activities: recordActivities.map((a) => ({
        ...a,
        contactName: a.contactId ? contactMap.get(a.contactId) || null : null,
        createdByName: userMap.get(a.createdById) || 'Rep',
      })),
      followUps: recordFollowUps.map((f) => ({
        ...f,
        contactName: f.contactId ? contactMap.get(f.contactId) || null : null,
        assignedToName: userMap.get(f.assignedToId) || 'Rep',
      })),
      appointments: recordAppointments,
      assignmentHistory: assignHist.map((h) => ({
        ...h,
        previousAssigneeName: h.previousAssigneeId ? userMap.get(h.previousAssigneeId) || null : null,
        newAssigneeName: userMap.get(h.newAssigneeId) || 'Rep',
        changedByName: userMap.get(h.changedById) || 'Manager',
      })),
    });
  } catch (error) {
    console.error('Workspace detail error:', error);
    res.status(500).json({ error: 'Failed to load prospect record workspace.' });
  }
});

// ==================== PROSPECT REMARKS & ACCOUNT BRIEF ====================
const REMARK_CATEGORIES = new Set([
  'GENERAL',
  'PAIN_POINT',
  'BUDGET_TIMELINE',
  'DECISION_MAKER',
  'COMPETITOR_STACK',
  'OBJECTION',
  'NEXT_STEP',
  'HANDOVER',
]);
const SENTIMENT_VALUES = new Set(['HOT', 'WARM', 'NEUTRAL', 'COOL', 'BLOCKER']);

operationsRouter.patch('/workspace/records/:recordId/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const recordId = Number(req.params.recordId);
    const user = req.currentUser!;
    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, recordId))
      .limit(1);
    if (!ccr) return res.status(404).json({ error: 'Prospect record not found.' });
    if (user.role === 'SALES_REP' && ccr.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: This record is not assigned to you.' });
    }

    const { prospectSummary, prospectSentiment } = req.body as {
      prospectSummary?: string | null;
      prospectSentiment?: string | null;
    };

    const cleanSummary = prospectSummary !== undefined ? (String(prospectSummary || '').trim() || null) : ccr.prospectSummary;
    const cleanSentiment =
      prospectSentiment !== undefined
        ? prospectSentiment && SENTIMENT_VALUES.has(String(prospectSentiment).toUpperCase())
          ? String(prospectSentiment).toUpperCase()
          : null
        : ccr.prospectSentiment;

    const [updated] = await db
      .update(campaignCompanyRecords)
      .set({
        prospectSummary: cleanSummary,
        prospectSentiment: cleanSentiment,
        updatedAt: new Date(),
      })
      .where(eq(campaignCompanyRecords.id, recordId))
      .returning();

    await logAudit({
      user,
      action: 'PROSPECT_SUMMARY_UPDATED',
      entity: 'campaign_company_record',
      entityId: recordId,
      previousValue: { prospectSummary: ccr.prospectSummary, prospectSentiment: ccr.prospectSentiment },
      newValue: { prospectSummary: cleanSummary, prospectSentiment: cleanSentiment },
    });

    res.json({ record: updated });
  } catch (error) {
    console.error('Update prospect summary error:', error);
    res.status(500).json({ error: 'Failed to save prospect summary.' });
  }
});

operationsRouter.post('/workspace/records/:recordId/remarks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const recordId = Number(req.params.recordId);
    const user = req.currentUser!;
    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, recordId))
      .limit(1);
    if (!ccr) return res.status(404).json({ error: 'Prospect record not found.' });
    if (user.role === 'SALES_REP' && ccr.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: This record is not assigned to you.' });
    }

    const { category, contactId, content, isPinned } = req.body as {
      category?: string;
      contactId?: number | string | null;
      content?: string;
      isPinned?: boolean;
    };

    const cleanContent = String(content || '').trim();
    if (!cleanContent) {
      return res.status(400).json({ error: 'Remark text cannot be empty.' });
    }

    const cleanCategory = REMARK_CATEGORIES.has(String(category || '').toUpperCase())
      ? String(category).toUpperCase()
      : 'GENERAL';

    const cleanContactId = contactId ? Number(contactId) : null;

    const [created] = await db
      .insert(prospectRemarks)
      .values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        companyId: ccr.companyId,
        contactId: cleanContactId,
        authorId: user.id,
        category: cleanCategory,
        content: cleanContent,
        isPinned: Boolean(isPinned),
      })
      .returning();

    await db
      .update(campaignCompanyRecords)
      .set({ updatedAt: new Date() })
      .where(eq(campaignCompanyRecords.id, ccr.id));

    const [[comp], [cmp], linkedContact] = await Promise.all([
      db.select().from(companies).where(eq(companies.id, ccr.companyId)).limit(1),
      db.select().from(campaigns).where(eq(campaigns.id, ccr.campaignId)).limit(1),
      cleanContactId ? db.select().from(contacts).where(eq(contacts.id, cleanContactId)).limit(1) : Promise.resolve([]),
    ]);

    if (user.role !== 'SALES_REP' && ccr.assignedToId && ccr.assignedToId !== user.id) {
      await createNotification({
        userId: ccr.assignedToId,
        type: 'PROSPECT_REMARK',
        title: `New Manager Note on ${comp?.name || 'Prospect'}`,
        message: `${user.fullName}: ${cleanContent.slice(0, 120)}`,
        entityType: 'campaign_company_record',
        entityId: ccr.id,
        linkPath: '/workspace',
      });
    } else if (cleanCategory === 'HANDOVER' && cmp?.campaignManagerId && cmp.campaignManagerId !== user.id) {
      await createNotification({
        userId: cmp.campaignManagerId,
        type: 'PROSPECT_HANDOVER_REMARK',
        title: `Rep Handover Note on ${comp?.name || 'Prospect'}`,
        message: `${user.fullName}: ${cleanContent.slice(0, 120)}`,
        entityType: 'campaign_company_record',
        entityId: ccr.id,
        linkPath: `/campaigns/${cmp.id}`,
      });
    }

    await logAudit({
      user,
      action: 'PROSPECT_REMARK_ADDED',
      entity: 'prospect_remark',
      entityId: created.id,
      newValue: { company: comp?.name, category: cleanCategory, isPinned: created.isPinned },
    });

    res.status(201).json({
      remark: {
        ...created,
        authorName: user.fullName,
        authorRole: user.role,
        contactName: linkedContact[0]?.fullName || null,
      },
    });
  } catch (error) {
    console.error('Create prospect remark error:', error);
    res.status(500).json({ error: 'Failed to save prospect remark.' });
  }
});

operationsRouter.patch('/remarks/:remarkId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const remarkId = Number(req.params.remarkId);
    const user = req.currentUser!;
    const [existing] = await db.select().from(prospectRemarks).where(eq(prospectRemarks.id, remarkId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Remark not found.' });

    const isManager = ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);
    if (!isManager && existing.authorId !== user.id) {
      return res.status(403).json({ error: 'You can only edit your own remarks.' });
    }

    const { content, category, isPinned, contactId } = req.body as {
      content?: string;
      category?: string;
      isPinned?: boolean;
      contactId?: number | string | null;
    };

    const nextContent = content !== undefined ? String(content).trim() : existing.content;
    if (!nextContent) {
      return res.status(400).json({ error: 'Remark text cannot be empty.' });
    }
    const nextCategory =
      category !== undefined && REMARK_CATEGORIES.has(String(category).toUpperCase())
        ? String(category).toUpperCase()
        : existing.category;
    const nextPinned = isPinned !== undefined ? Boolean(isPinned) : existing.isPinned;
    const nextContactId = contactId !== undefined ? (contactId ? Number(contactId) : null) : existing.contactId;

    const [updated] = await db
      .update(prospectRemarks)
      .set({
        content: nextContent,
        category: nextCategory,
        isPinned: nextPinned,
        contactId: nextContactId,
        updatedAt: new Date(),
      })
      .where(eq(prospectRemarks.id, remarkId))
      .returning();

    const [[author], linkedContact] = await Promise.all([
      db.select().from(users).where(eq(users.id, updated.authorId)).limit(1),
      updated.contactId ? db.select().from(contacts).where(eq(contacts.id, updated.contactId)).limit(1) : Promise.resolve([]),
    ]);

    await logAudit({
      user,
      action: 'PROSPECT_REMARK_UPDATED',
      entity: 'prospect_remark',
      entityId: remarkId,
      previousValue: { content: existing.content, category: existing.category, isPinned: existing.isPinned },
      newValue: { content: updated.content, category: updated.category, isPinned: updated.isPinned },
    });

    res.json({
      remark: {
        ...updated,
        authorName: author?.fullName || 'Team Member',
        authorRole: author?.role || 'SALES_REP',
        contactName: linkedContact[0]?.fullName || null,
      },
    });
  } catch (error) {
    console.error('Update remark error:', error);
    res.status(500).json({ error: 'Failed to update remark.' });
  }
});

operationsRouter.delete('/remarks/:remarkId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const remarkId = Number(req.params.remarkId);
    const user = req.currentUser!;
    const [existing] = await db.select().from(prospectRemarks).where(eq(prospectRemarks.id, remarkId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Remark not found.' });

    const isManager = ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);
    if (!isManager && existing.authorId !== user.id) {
      return res.status(403).json({ error: 'You can only delete your own remarks.' });
    }

    await db.delete(prospectRemarks).where(eq(prospectRemarks.id, remarkId));

    await logAudit({
      user,
      action: 'PROSPECT_REMARK_DELETED',
      entity: 'prospect_remark',
      entityId: remarkId,
      previousValue: { category: existing.category, content: existing.content.slice(0, 120) },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Delete remark error:', error);
    res.status(500).json({ error: 'Failed to delete remark.' });
  }
});

// ==================== ACTIVITIES ====================
operationsRouter.get('/activities', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const campaignId = req.query.campaignId ? Number(req.query.campaignId) : null;
    const channel = req.query.channel ? String(req.query.channel) : null;
    const repId = req.query.repId ? Number(req.query.repId) : null;

    const [allActs, allCompanies, allContacts, allCampaigns, allUsers] = await Promise.all([
      db.select().from(activities).orderBy(desc(activities.activityDate), desc(activities.createdAt)),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaigns),
      db.select().from(users),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
    const contactMap = new Map(allContacts.map((c) => [c.id, c.fullName]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const filtered = allActs.filter((a) => {
      if (user.role === 'SALES_REP' && a.createdById !== user.id) return false;
      if (campaignId && a.campaignId !== campaignId) return false;
      if (channel && a.channel !== channel) return false;
      if (repId && user.role !== 'SALES_REP' && a.createdById !== repId) return false;
      return true;
    });

    res.json({
      activities: filtered.slice(0, 250).map((a) => ({
        ...a,
        companyName: companyMap.get(a.companyId) || '',
        contactName: a.contactId ? contactMap.get(a.contactId) || '' : '',
        campaignName: campaignMap.get(a.campaignId) || '',
        repName: userMap.get(a.createdById) || '',
      })),
    });
  } catch (error) {
    console.error('List activities error:', error);
    res.status(500).json({ error: 'Failed to load outreach activities.' });
  }
});

operationsRouter.post('/activities', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const {
      campaignCompanyRecordId,
      contactId,
      activityDate,
      activityTime,
      channel,
      activityType,
      outcome,
      responseCategory,
      notes,
      followUpDate,
      followUpTime,
      followUpType,
      durationSeconds,
      emailSubject,
      externalMessageId,
      recordingUrl,
      addToGlobalDnc,
    } = req.body as Record<string, any>;

    if (!campaignCompanyRecordId || !channel || !outcome) {
      return res.status(400).json({ error: 'Record, channel, and outcome are required.' });
    }

    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, Number(campaignCompanyRecordId)))
      .limit(1);

    if (!ccr) return res.status(404).json({ error: 'Prospect record not found.' });
    if (user.role === 'SALES_REP' && ccr.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Record not assigned to you.' });
    }

    const [rulesSetting] = await db.select().from(appSettings).where(eq(appSettings.key, 'outcome_rules')).limit(1);
    const rules = (rulesSetting?.value as OutcomeRule[]) || DEFAULT_OUTCOME_RULES;
    const resultingStatus = resolveStatusFromOutcome(String(outcome), rules);

    const actDate = activityDate || new Date().toISOString().slice(0, 10);
    const actTime = activityTime || new Date().toTimeString().slice(0, 5);

    const [createdActivity] = await db
      .insert(activities)
      .values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        companyId: ccr.companyId,
        contactId: contactId ? Number(contactId) : null,
        createdById: user.id,
        activityDate: actDate,
        activityTime: actTime,
        channel: String(channel),
        activityType: activityType || String(channel).replace(/_/g, ' '),
        outcome: String(outcome),
        responseCategory: responseCategory || null,
        notes: notes || null,
        followUpDate: followUpDate || null,
        resultingStatus,
        durationSeconds: durationSeconds !== undefined && durationSeconds !== '' ? Number(durationSeconds) : null,
        emailSubject: emailSubject || null,
        externalMessageId: externalMessageId || null,
        recordingUrl: recordingUrl || null,
      })
      .returning();

    const prevStatus = ccr.status;
    await db
      .update(campaignCompanyRecords)
      .set({
        status: resultingStatus,
        lastActivityAt: new Date(),
        lastOutcome: String(outcome),
        workedCount: ccr.workedCount + 1,
        nextFollowUpAt: followUpDate ? new Date(`${followUpDate}T${followUpTime || '10:00'}:00`) : ccr.nextFollowUpAt,
        updatedAt: new Date(),
      })
      .where(eq(campaignCompanyRecords.id, ccr.id));

    if (contactId) {
      await db
        .update(campaignContactRecords)
        .set({
          status: resultingStatus,
          lastActivityAt: new Date(),
          lastOutcome: String(outcome),
          updatedAt: new Date(),
        })
        .where(and(eq(campaignContactRecords.campaignId, ccr.campaignId), eq(campaignContactRecords.contactId, Number(contactId))));
    }

    // Global DNC enforcement if DO_NOT_CONTACT
    if (resultingStatus === 'DO_NOT_CONTACT' || outcome === 'DO_NOT_CONTACT' || addToGlobalDnc) {
      if (contactId) {
        const [ct] = await db.select().from(contacts).where(eq(contacts.id, Number(contactId))).limit(1);
        if (ct) {
          await db.update(contacts).set({ doNotContact: true, updatedAt: new Date() }).where(eq(contacts.id, ct.id));
          const normEm = normalizeEmail(ct.workEmail);
          const normPh = normalizePhone(ct.phone);
          if (normEm) {
            await db
              .insert(dncSuppression)
              .values({ type: 'EMAIL', value: normEm, rawValue: ct.workEmail!, reason: 'Marked DNC during outreach', addedById: user.id })
              .onConflictDoNothing();
          }
          if (normPh) {
            await db
              .insert(dncSuppression)
              .values({ type: 'PHONE', value: normPh, rawValue: ct.phone!, reason: 'Marked DNC during outreach', addedById: user.id })
              .onConflictDoNothing();
          }
        }
      }
    }

    // Auto-stop active sequence enrollments on positive reply or appointment
    const positiveOutcomes = new Set(['INTERESTED', 'QUALIFIED_LEAD', 'APPOINTMENT_BOOKED', 'REQUESTED_INFO', 'CONNECTED_CONVERSATION']);
    if (positiveOutcomes.has(String(outcome)) || ['INTERESTED', 'APPOINTMENT_BOOKED', 'DO_NOT_CONTACT', 'NOT_INTERESTED'].includes(resultingStatus)) {
      const stopStatus = resultingStatus === 'APPOINTMENT_BOOKED' ? 'STOPPED_APPOINTMENT' : 'STOPPED_REPLY';
      await db
        .update(sequenceEnrollments)
        .set({ status: stopStatus, updatedAt: new Date() })
        .where(and(eq(sequenceEnrollments.campaignCompanyRecordId, ccr.id), eq(sequenceEnrollments.status, 'ACTIVE')));
    }

    let createdFollowUp = null;
    if (followUpDate) {
      const [fup] = await db
        .insert(followUps)
        .values({
          campaignId: ccr.campaignId,
          campaignCompanyRecordId: ccr.id,
          companyId: ccr.companyId,
          contactId: contactId ? Number(contactId) : null,
          assignedToId: ccr.assignedToId || user.id,
          followUpType: followUpType || (channel === 'PHONE_CALL' ? 'CALL' : channel === 'EMAIL' ? 'EMAIL' : 'CALL'),
          followUpDate: String(followUpDate),
          followUpTime: followUpTime || '10:00',
          notes: notes || `Follow-up scheduled from ${channel} activity`,
          status: 'PENDING',
        })
        .returning();
      createdFollowUp = fup;
    }

    await logAudit({
      user,
      action: 'ACTIVITY_LOGGED',
      entity: 'campaign_company_record',
      entityId: ccr.id,
      previousValue: { status: prevStatus },
      newValue: { status: resultingStatus, channel, outcome },
    });

    res.status(201).json({ activity: createdActivity, resultingStatus, followUp: createdFollowUp });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ error: 'Failed to record outreach activity.' });
  }
});

// ==================== FOLLOW-UPS ====================
operationsRouter.get('/follow-ups', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const today = new Date().toISOString().slice(0, 10);

    const [allFups, allCompanies, allContacts, allCampaigns, allUsers] = await Promise.all([
      db.select().from(followUps).orderBy(followUps.followUpDate, followUps.followUpTime),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaigns),
      db.select().from(users),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
    const contactMap = new Map(allContacts.map((c) => [c.id, c.fullName]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const visible = allFups
      .filter((f) => user.role !== 'SALES_REP' || f.assignedToId === user.id)
      .map((f) => {
        const computedStatus = f.status === 'PENDING' && f.followUpDate < today ? 'OVERDUE' : f.status;
        return {
          ...f,
          status: computedStatus,
          companyName: companyMap.get(f.companyId) || '',
          contactName: f.contactId ? contactMap.get(f.contactId) || '' : '',
          campaignName: campaignMap.get(f.campaignId) || '',
          assignedToName: userMap.get(f.assignedToId) || '',
        };
      });

    res.json({ followUps: visible });
  } catch (error) {
    console.error('List follow-ups error:', error);
    res.status(500).json({ error: 'Failed to load follow-ups.' });
  }
});

operationsRouter.post('/follow-ups', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const body = req.body as Record<string, any>;
    if (!body.campaignCompanyRecordId || !body.followUpDate || !body.followUpType) {
      return res.status(400).json({ error: 'Prospect record, follow-up type, and date are required.' });
    }

    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, Number(body.campaignCompanyRecordId)))
      .limit(1);
    if (!ccr) return res.status(404).json({ error: 'Prospect record not found.' });
    if (user.role === 'SALES_REP' && ccr.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden: Record not assigned to you.' });
    }

    const [created] = await db
      .insert(followUps)
      .values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        companyId: ccr.companyId,
        contactId: body.contactId ? Number(body.contactId) : null,
        assignedToId: ccr.assignedToId || user.id,
        followUpType: String(body.followUpType),
        followUpDate: String(body.followUpDate),
        followUpTime: body.followUpTime || '10:00',
        reminderMinutes: Number(body.reminderMinutes || 30),
        notes: body.notes || null,
        status: 'PENDING',
      })
      .returning();

    res.status(201).json({ followUp: created });
  } catch (error) {
    console.error('Create follow-up error:', error);
    res.status(500).json({ error: 'Failed to create follow-up.' });
  }
});

operationsRouter.patch('/follow-ups/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(followUps).where(eq(followUps.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Follow-up not found.' });
    if (user.role === 'SALES_REP' && existing.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const body = req.body as Record<string, any>;
    const nextStatus = body.status || existing.status;

    const [updated] = await db
      .update(followUps)
      .set({
        status: nextStatus,
        followUpDate: body.followUpDate || existing.followUpDate,
        followUpTime: body.followUpTime || existing.followUpTime,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        completedAt: nextStatus === 'COMPLETED' ? new Date() : existing.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(followUps.id, id))
      .returning();

    let nextFollowUp = null;
    if (body.createNext && body.nextDate) {
      const [createdNext] = await db
        .insert(followUps)
        .values({
          campaignId: existing.campaignId,
          campaignCompanyRecordId: existing.campaignCompanyRecordId,
          companyId: existing.companyId,
          contactId: existing.contactId,
          assignedToId: existing.assignedToId,
          followUpType: body.nextType || existing.followUpType,
          followUpDate: String(body.nextDate),
          followUpTime: body.nextTime || '10:00',
          notes: body.nextNotes || '',
          status: 'PENDING',
        })
        .returning();
      nextFollowUp = createdNext;
    }

    res.json({ followUp: updated, nextFollowUp });
  } catch (error) {
    console.error('Update follow-up error:', error);
    res.status(500).json({ error: 'Failed to update follow-up.' });
  }
});

operationsRouter.post('/follow-ups/bulk', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const { ids, action, followUpDate, followUpTime, assignedToId } = req.body as {
      ids?: number[];
      action?: 'COMPLETE' | 'RESCHEDULE' | 'REASSIGN';
      followUpDate?: string;
      followUpTime?: string;
      assignedToId?: number;
    };

    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return res.status(400).json({ error: 'Select at least one follow-up and action.' });
    }

    const isManager = ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);
    if (action === 'REASSIGN' && !isManager) {
      return res.status(403).json({ error: 'Only managers can reassign follow-up tasks.' });
    }
    if (action === 'RESCHEDULE' && !followUpDate) {
      return res.status(400).json({ error: 'Select a target reschedule date.' });
    }
    if (action === 'REASSIGN' && !assignedToId) {
      return res.status(400).json({ error: 'Select a representative to reassign to.' });
    }

    const allRows = await db.select().from(followUps);
    const idSet = new Set(ids.map(Number));
    const targetRows = allRows.filter((f) => idSet.has(f.id) && (isManager || f.assignedToId === user.id));

    let updatedCount = 0;
    for (const fup of targetRows) {
      if (action === 'COMPLETE') {
        await db
          .update(followUps)
          .set({ status: 'COMPLETED', completedAt: new Date(), updatedAt: new Date() })
          .where(eq(followUps.id, fup.id));
        updatedCount++;
      } else if (action === 'RESCHEDULE') {
        await db
          .update(followUps)
          .set({
            status: 'PENDING',
            followUpDate: String(followUpDate),
            followUpTime: followUpTime || fup.followUpTime,
            updatedAt: new Date(),
          })
          .where(eq(followUps.id, fup.id));
        updatedCount++;
      } else if (action === 'REASSIGN') {
        await db
          .update(followUps)
          .set({ assignedToId: Number(assignedToId), updatedAt: new Date() })
          .where(eq(followUps.id, fup.id));
        updatedCount++;
      }
    }

    res.json({ ok: true, updatedCount });
  } catch (error) {
    console.error('Bulk follow-up error:', error);
    res.status(500).json({ error: 'Failed to process bulk follow-up action.' });
  }
});

// ==================== APPOINTMENTS ====================
operationsRouter.get('/appointments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const [allAppts, allCompanies, allCampaigns, allUsers] = await Promise.all([
      db.select().from(appointments).orderBy(appointments.appointmentDate, appointments.appointmentTime),
      db.select().from(companies),
      db.select().from(campaigns),
      db.select().from(users),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const visible = allAppts
      .filter((ap) => user.role !== 'SALES_REP' || ap.assignedToId === user.id)
      .map((ap) => ({
        ...ap,
        companyName: companyMap.get(ap.companyId) || '',
        campaignName: campaignMap.get(ap.campaignId) || '',
        assignedToName: userMap.get(ap.assignedToId) || '',
      }));

    const summary = {
      total: visible.length,
      confirmed: visible.filter((a) => a.status === 'CONFIRMED' || a.confirmationStatus === 'CONFIRMED').length,
      completed: visible.filter((a) => a.status === 'COMPLETED').length,
      noShows: visible.filter((a) => a.status === 'NO_SHOW').length,
      rescheduled: visible.filter((a) => a.status === 'RESCHEDULED').length,
      scheduled: visible.filter((a) => a.status === 'SCHEDULED' || a.status === 'PENDING_CONFIRMATION').length,
    };

    res.json({ appointments: visible, summary });
  } catch (error) {
    console.error('List appointments error:', error);
    res.status(500).json({ error: 'Failed to load appointments.' });
  }
});

operationsRouter.post('/appointments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const body = req.body as Record<string, any>;
    if (!body.campaignCompanyRecordId || !body.prospectName || !body.appointmentDate || !body.appointmentTime) {
      return res.status(400).json({ error: 'Record, prospect name, date, and time are required.' });
    }

    const [ccr] = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.id, Number(body.campaignCompanyRecordId)))
      .limit(1);
    if (!ccr) return res.status(404).json({ error: 'Prospect record not found.' });
    if (user.role === 'SALES_REP' && ccr.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [created] = await db
      .insert(appointments)
      .values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        companyId: ccr.companyId,
        contactId: body.contactId ? Number(body.contactId) : null,
        prospectName: String(body.prospectName).trim(),
        prospectTitle: body.prospectTitle || null,
        prospectPhone: body.prospectPhone || null,
        prospectEmail: body.prospectEmail || null,
        assignedToId: ccr.assignedToId || user.id,
        appointmentDate: String(body.appointmentDate),
        appointmentTime: String(body.appointmentTime),
        timezone: body.timezone || 'America/New_York',
        meetingType: body.meetingType || 'Video Call',
        meetingLink: body.meetingLink || null,
        meetingLocation: body.meetingLocation || null,
        notes: body.notes || null,
        requirements: body.requirements || null,
        status: body.status || 'SCHEDULED',
        confirmationStatus: body.confirmationStatus || 'PENDING',
        googleEventId: body.googleEventId || null,
        calendarSynced: Boolean(body.googleEventId || body.calendarSynced),
      })
      .returning();

    await db
      .update(campaignCompanyRecords)
      .set({
        status: 'APPOINTMENT_BOOKED',
        lastActivityAt: new Date(),
        lastOutcome: 'APPOINTMENT_BOOKED',
        updatedAt: new Date(),
      })
      .where(eq(campaignCompanyRecords.id, ccr.id));

    await db
      .update(sequenceEnrollments)
      .set({ status: 'STOPPED_APPOINTMENT', updatedAt: new Date() })
      .where(and(eq(sequenceEnrollments.campaignCompanyRecordId, ccr.id), eq(sequenceEnrollments.status, 'ACTIVE')));

    await db.insert(activities).values({
      campaignId: ccr.campaignId,
      campaignCompanyRecordId: ccr.id,
      companyId: ccr.companyId,
      contactId: body.contactId ? Number(body.contactId) : null,
      createdById: user.id,
      activityDate: new Date().toISOString().slice(0, 10),
      activityTime: new Date().toTimeString().slice(0, 5),
      channel: 'OTHER',
      activityType: 'Appointment Scheduled',
      outcome: 'APPOINTMENT_BOOKED',
      responseCategory: 'MEETING_AGREED',
      notes: `Appointment scheduled with ${created.prospectName} for ${created.appointmentDate} ${created.appointmentTime} (${created.timezone})`,
      resultingStatus: 'APPOINTMENT_BOOKED',
    });

    // Notify Super Admins
    const admins = await db.select().from(users).where(eq(users.role, 'SUPER_ADMIN'));
    for (const adm of admins) {
      await createNotification({
        userId: adm.id,
        type: 'APPOINTMENT_BOOKED',
        title: `Appointment Booked by ${user.fullName}`,
        message: `${created.prospectName} scheduled for ${created.appointmentDate} at ${created.appointmentTime}.`,
        entityType: 'appointment',
        entityId: created.id,
        linkPath: '/appointments',
      });
    }

    await dispatchExternalAlert({
      event: 'APPOINTMENT_BOOKED',
      title: `Appointment Booked by ${user.fullName}`,
      message: `${created.prospectName} (${created.meetingType}) on ${created.appointmentDate} at ${created.appointmentTime} ${created.timezone}`,
    });

    await logAudit({
      user,
      action: 'APPOINTMENT_CREATED',
      entity: 'appointment',
      entityId: created.id,
      newValue: { prospectName: created.prospectName, appointmentDate: created.appointmentDate },
    });

    res.status(201).json({ appointment: created });
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment.' });
  }
});

operationsRouter.patch('/appointments/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const id = Number(req.params.id);
    const [existing] = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Appointment not found.' });
    if (user.role === 'SALES_REP' && existing.assignedToId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const body = req.body as Record<string, any>;
    const [updated] = await db
      .update(appointments)
      .set({
        status: body.status || existing.status,
        confirmationStatus: body.confirmationStatus || existing.confirmationStatus,
        appointmentDate: body.appointmentDate || existing.appointmentDate,
        appointmentTime: body.appointmentTime || existing.appointmentTime,
        meetingLink: body.meetingLink !== undefined ? body.meetingLink : existing.meetingLink,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        googleEventId: body.googleEventId !== undefined ? body.googleEventId : existing.googleEventId,
        calendarSynced: body.calendarSynced !== undefined ? Boolean(body.calendarSynced) : existing.calendarSynced,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, id))
      .returning();

    await logAudit({
      user,
      action: 'APPOINTMENT_MODIFIED',
      entity: 'appointment',
      entityId: id,
      previousValue: { status: existing.status, date: existing.appointmentDate },
      newValue: { status: updated.status, date: updated.appointmentDate },
    });

    res.json({ appointment: updated });
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment.' });
  }
});

// ==================== DATA REQUESTS ====================
operationsRouter.get('/data-requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const [allReqs, allCampaigns, allUsers] = await Promise.all([
      db.select().from(dataRequests).orderBy(desc(dataRequests.createdAt)),
      db.select().from(campaigns),
      db.select().from(users),
    ]);
    const cmpMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const visible = allReqs
      .filter((r) => user.role !== 'SALES_REP' || r.requestedById === user.id)
      .map((r) => ({
        ...r,
        campaignName: r.campaignId ? cmpMap.get(r.campaignId) || 'General' : 'General',
        requestedByName: userMap.get(r.requestedById) || 'Rep',
        reviewedByName: r.reviewedById ? userMap.get(r.reviewedById) || null : null,
      }));

    res.json({ dataRequests: visible });
  } catch (error) {
    console.error('List data requests error:', error);
    res.status(500).json({ error: 'Failed to load data requests.' });
  }
});

operationsRouter.post('/data-requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const body = req.body as Record<string, any>;
    if (!body.title || !body.quantityRequired) {
      return res.status(400).json({ error: 'Request title and quantity required are mandatory.' });
    }

    const [created] = await db
      .insert(dataRequests)
      .values({
        title: String(body.title).trim(),
        campaignId: body.campaignId ? Number(body.campaignId) : null,
        industry: body.industry || null,
        country: body.country || null,
        targetJobTitles: body.targetJobTitles || null,
        companySize: body.companySize || null,
        quantityRequired: Number(body.quantityRequired),
        reason: body.reason || null,
        priority: body.priority || 'MEDIUM',
        requestedById: user.id,
        status: 'PENDING',
      })
      .returning();

    const managers = await db.select().from(users);
    for (const m of managers.filter((u) => u.role === 'DATA_MANAGER' || u.role === 'CAMPAIGN_MANAGER' || u.role === 'SUPER_ADMIN')) {
      await createNotification({
        userId: m.id,
        type: 'DATA_REQUEST_CREATED',
        title: `New Data Request: ${created.title}`,
        message: `${user.fullName} requested ${created.quantityRequired} records.`,
        entityType: 'data_request',
        entityId: created.id,
        linkPath: '/data-requests',
      });
    }

    res.status(201).json({ dataRequest: created });
  } catch (error) {
    console.error('Create data request error:', error);
    res.status(500).json({ error: 'Failed to submit data request.' });
  }
});

operationsRouter.patch(
  '/data-requests/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      const [existing] = await db.select().from(dataRequests).where(eq(dataRequests.id, id)).limit(1);
      if (!existing) return res.status(404).json({ error: 'Data request not found.' });

      const body = req.body as Record<string, any>;
      const [updated] = await db
        .update(dataRequests)
        .set({
          status: body.status || existing.status,
          managerRemarks: body.managerRemarks !== undefined ? body.managerRemarks : existing.managerRemarks,
          fulfilledQuantity:
            body.fulfilledQuantity !== undefined ? Number(body.fulfilledQuantity) : existing.fulfilledQuantity,
          reviewedById: req.currentUser!.id,
          updatedAt: new Date(),
        })
        .where(eq(dataRequests.id, id))
        .returning();

      await createNotification({
        userId: existing.requestedById,
        type: `DATA_REQUEST_${updated.status}`,
        title: `Data Request ${updated.status}: ${updated.title}`,
        message: updated.managerRemarks || `Your data request status is now ${updated.status}.`,
        entityType: 'data_request',
        entityId: updated.id,
        linkPath: '/data-requests',
      });

      await logAudit({
        user: req.currentUser,
        action: `DATA_REQUEST_${updated.status}`,
        entity: 'data_request',
        entityId: id,
        previousValue: { status: existing.status },
        newValue: { status: updated.status, fulfilledQuantity: updated.fulfilledQuantity },
      });

      res.json({ dataRequest: updated });
    } catch (error) {
      console.error('Update data request error:', error);
      res.status(500).json({ error: 'Failed to update data request.' });
    }
  }
);
