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
  dataRequests,
  followUps,
  users,
} from '../../db/schema.ts';
import { AuthRequest, createNotification, logAudit, requireAuth, requireRole } from '../auth.ts';
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

    const [allCCRs, allCompanies, allContacts, allCampaigns, allUsers, allFollowUps, allActivities] = await Promise.all([
      db.select().from(campaignCompanyRecords).orderBy(desc(campaignCompanyRecords.updatedAt)),
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaigns),
      db.select().from(users),
      db.select().from(followUps),
      db.select().from(activities).orderBy(desc(activities.createdAt)),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const filtered = allCCRs.filter((r) => {
      // Strict Sales Rep isolation: Sales reps ONLY see records assigned to them
      if (user.role === 'SALES_REP' && r.assignedToId !== user.id) return false;
      if (campaignId && r.campaignId !== campaignId) return false;
      if (statusFilter && r.status !== statusFilter) return false;

      if (filterPreset === 'NOT_YET_WORKED' && r.status !== 'NOT_YET_WORKED') return false;
      if (filterPreset === 'WORKED' && r.status === 'NOT_YET_WORKED') return false;
      if (filterPreset === 'INTERESTED' && !['INTERESTED', 'QUALIFIED_LEAD'].includes(r.status)) return false;
      if (filterPreset === 'NOT_INTERESTED' && !['NOT_INTERESTED', 'NOT_QUALIFIED', 'DO_NOT_CONTACT'].includes(r.status)) return false;
      if (filterPreset === 'FOLLOW_UP' && r.status !== 'FOLLOW_UP_REQUIRED') return false;
      if (filterPreset === 'APPOINTMENT' && r.status !== 'APPOINTMENT_BOOKED') return false;

      if (search) {
        const comp = companyMap.get(r.companyId);
        const compContacts = allContacts.filter((ct) => ct.companyId === r.companyId);
        const contactStr = compContacts.map((ct) => `${ct.fullName} ${ct.workEmail || ''} ${ct.jobTitle || ''}`).join(' ');
        const hay = `${comp?.name || ''} ${comp?.domain || ''} ${contactStr} ${campaignMap.get(r.campaignId)?.name || ''}`.toLowerCase();
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

    const [[company], [campaign], companyContacts, recordActivities, recordFollowUps, recordAppointments, assignHist, allUsers] =
      await Promise.all([
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
      ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));
    const contactMap = new Map(companyContacts.map((c) => [c.id, c.fullName]));

    res.json({
      record: ccr,
      company,
      campaign,
      contacts: companyContacts,
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
