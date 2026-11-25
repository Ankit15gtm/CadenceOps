import { Router } from 'express';
import { eq, desc, inArray, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activities,
  appointments,
  assignmentHistory,
  assignments,
  campaignCompanyRecords,
  campaignContactRecords,
  campaignMembers,
  campaigns,
  companies,
  contacts,
  followUps,
  importBatches,
  importRecords,
  users,
} from '../../db/schema.ts';
import { AuthRequest, createNotification, logAudit, requireAuth, requireRole } from '../auth.ts';
import {
  computeRecordQualityScores,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
  normalizeWebsite,
} from '../normalization.ts';

export const dataRouter = Router();

// ==================== CAMPAIGNS ====================
dataRouter.get('/campaigns', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const [allCampaigns, allUsers, allCCRs, allMembers, allAppointments] = await Promise.all([
      db.select().from(campaigns).orderBy(desc(campaigns.createdAt)),
      db.select().from(users),
      db.select().from(campaignCompanyRecords),
      db.select().from(campaignMembers),
      db.select().from(appointments),
    ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    let visibleCampaigns = allCampaigns;
    if (user.role === 'SALES_REP') {
      const repCampaignIds = new Set<number>();
      for (const m of allMembers) {
        if (m.userId === user.id) repCampaignIds.add(m.campaignId);
      }
      for (const r of allCCRs) {
        if (r.assignedToId === user.id) repCampaignIds.add(r.campaignId);
      }
      visibleCampaigns = allCampaigns.filter((c) => repCampaignIds.has(c.id));
    }

    const enriched = visibleCampaigns.map((c) => {
      const cRows =
        user.role === 'SALES_REP'
          ? allCCRs.filter((r) => r.campaignId === c.id && r.assignedToId === user.id)
          : allCCRs.filter((r) => r.campaignId === c.id);
      const assignedCount = cRows.filter((r) => r.assignedToId !== null).length;
      const workedCount = cRows.filter((r) => r.status !== 'NOT_YET_WORKED').length;
      const apptCount = allAppointments.filter(
        (a) => a.campaignId === c.id && a.status !== 'CANCELLED' && (user.role !== 'SALES_REP' || a.assignedToId === user.id)
      ).length;
      const teamMembers = allMembers
        .filter((m) => m.campaignId === c.id)
        .map((m) => ({ userId: m.userId, fullName: userMap.get(m.userId) || 'Member', allocatedQuota: m.allocatedQuota }));

      return {
        ...c,
        campaignManagerName: c.campaignManagerId ? userMap.get(c.campaignManagerId) || null : null,
        dataManagerName: c.dataManagerId ? userMap.get(c.dataManagerId) || null : null,
        totalImported: cRows.length,
        totalAllocated: assignedCount,
        totalWorked: workedCount,
        totalAppointments: apptCount,
        teamMembers,
      };
    });

    res.json({ campaigns: enriched });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Failed to load campaigns.' });
  }
});

dataRouter.post('/campaigns', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, any>;
    if (!body.name || !String(body.name).trim()) {
      return res.status(400).json({ error: 'Campaign name is required.' });
    }

    const existingCount = await db.select({ count: sql<number>`count(*)::int` }).from(campaigns);
    const code = `CMP-${new Date().getFullYear()}-${String((existingCount[0]?.count ?? 0) + 1).padStart(3, '0')}`;

    const [created] = await db
      .insert(campaigns)
      .values({
        campaignCode: code,
        name: String(body.name).trim(),
        description: body.description || null,
        clientName: body.clientName || null,
        objective: body.objective || null,
        targetIndustry: body.targetIndustry || null,
        targetCountries: body.targetCountries || null,
        targetJobTitles: body.targetJobTitles || null,
        targetCompanySize: body.targetCompanySize || null,
        startDate: body.startDate || null,
        endDate: body.endDate || null,
        campaignManagerId: body.campaignManagerId ? Number(body.campaignManagerId) : req.currentUser!.id,
        dataManagerId: body.dataManagerId ? Number(body.dataManagerId) : req.currentUser!.id,
        status: body.status || 'DRAFT',
        targetCompaniesCount: Number(body.targetCompaniesCount || 0),
        notes: body.notes || null,
        instructions: body.instructions || null,
        qualificationCriteria: body.qualificationCriteria || null,
        qualificationQuestions: Array.isArray(body.qualificationQuestions) ? body.qualificationQuestions : [],
        allowDuplicateAssignments: Boolean(body.allowDuplicateAssignments),
        createdById: req.currentUser!.id,
      })
      .returning();

    if (Array.isArray(body.salesRepIds)) {
      for (const repId of body.salesRepIds) {
        await db
          .insert(campaignMembers)
          .values({ campaignId: created.id, userId: Number(repId), memberRole: 'SALES_REP' })
          .onConflictDoNothing();
        await createNotification({
          userId: Number(repId),
          type: 'CAMPAIGN_ASSIGNMENT',
          title: `Assigned to Campaign: ${created.name}`,
          message: 'You have been added to a prospecting campaign.',
          entityType: 'campaign',
          entityId: created.id,
          linkPath: `/campaigns/${created.id}`,
        });
      }
    }

    await logAudit({
      user: req.currentUser,
      action: 'CAMPAIGN_CREATED',
      entity: 'campaign',
      entityId: created.id,
      newValue: { name: created.name, status: created.status },
    });

    res.status(201).json({ campaign: created });
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Failed to create campaign.' });
  }
});

dataRouter.get('/campaigns/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const campaignId = Number(req.params.id);
    const user = req.currentUser!;
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

    const [allUsers, ccrRows, ccrContacts, members, cmpActivities, cmpFollowUps, cmpAppointments, allCompanies, allContacts] =
      await Promise.all([
        db.select().from(users),
        db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.campaignId, campaignId)),
        db.select().from(campaignContactRecords).where(eq(campaignContactRecords.campaignId, campaignId)),
        db.select().from(campaignMembers).where(eq(campaignMembers.campaignId, campaignId)),
        db.select().from(activities).where(eq(activities.campaignId, campaignId)).orderBy(desc(activities.createdAt)),
        db.select().from(followUps).where(eq(followUps.campaignId, campaignId)).orderBy(desc(followUps.createdAt)),
        db.select().from(appointments).where(eq(appointments.campaignId, campaignId)).orderBy(desc(appointments.createdAt)),
        db.select().from(companies),
        db.select().from(contacts),
      ]);

    const userMap = new Map(allUsers.map((u) => [u.id, u]));
    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
    const contactMap = new Map(allContacts.map((c) => [c.id, c]));

    // Enforce Sales Rep isolation
    const isRep = user.role === 'SALES_REP';
    if (isRep) {
      const hasAccess = members.some((m) => m.userId === user.id) || ccrRows.some((r) => r.assignedToId === user.id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'You are not assigned to this campaign.' });
      }
    }

    const visibleCCRs = isRep ? ccrRows.filter((r) => r.assignedToId === user.id) : ccrRows;
    const visibleContacts = isRep ? ccrContacts.filter((r) => r.assignedToId === user.id) : ccrContacts;
    const visibleActs = isRep ? cmpActivities.filter((a) => a.createdById === user.id) : cmpActivities;
    const visibleFups = isRep ? cmpFollowUps.filter((f) => f.assignedToId === user.id) : cmpFollowUps;
    const visibleAppts = isRep ? cmpAppointments.filter((a) => a.assignedToId === user.id) : cmpAppointments;

    res.json({
      campaign: {
        ...campaign,
        campaignManagerName: campaign.campaignManagerId ? userMap.get(campaign.campaignManagerId)?.fullName : null,
        dataManagerName: campaign.dataManagerId ? userMap.get(campaign.dataManagerId)?.fullName : null,
      },
      companies: visibleCCRs.map((r) => {
        const comp = companyMap.get(r.companyId);
        return {
          ...r,
          companyName: comp?.name || 'Unknown',
          website: comp?.website,
          domain: comp?.domain,
          industry: comp?.industry,
          country: comp?.country,
          employeeSize: comp?.employeeSize,
          aiScore: comp?.aiScore ?? 0,
          fitScore: comp?.fitScore ?? 0,
          assignedToName: r.assignedToId ? userMap.get(r.assignedToId)?.fullName || null : null,
        };
      }),
      contacts: visibleContacts.map((cc) => {
        const ct = contactMap.get(cc.contactId);
        const comp = companyMap.get(cc.companyId);
        return {
          ...cc,
          fullName: ct?.fullName || 'Unknown',
          jobTitle: ct?.jobTitle,
          workEmail: ct?.workEmail,
          phone: ct?.phone,
          linkedinUrl: ct?.linkedinUrl,
          companyName: comp?.name || '',
          assignedToName: cc.assignedToId ? userMap.get(cc.assignedToId)?.fullName || null : null,
        };
      }),
      salesTeam: members.map((m) => {
        const u = userMap.get(m.userId);
        const repRows = ccrRows.filter((r) => r.assignedToId === m.userId);
        return {
          ...m,
          fullName: u?.fullName || 'User',
          email: u?.email || '',
          jobRole: u?.jobRole || '',
          assignedCount: repRows.length,
          workedCount: repRows.filter((r) => r.status !== 'NOT_YET_WORKED').length,
          appointmentsCount: cmpAppointments.filter((a) => a.assignedToId === m.userId && a.status !== 'CANCELLED').length,
        };
      }),
      activities: visibleActs.map((a) => ({
        ...a,
        companyName: companyMap.get(a.companyId)?.name || '',
        contactName: a.contactId ? contactMap.get(a.contactId)?.fullName || '' : '',
        repName: userMap.get(a.createdById)?.fullName || '',
      })),
      followUps: visibleFups.map((f) => ({
        ...f,
        companyName: companyMap.get(f.companyId)?.name || '',
        contactName: f.contactId ? contactMap.get(f.contactId)?.fullName || '' : '',
        repName: userMap.get(f.assignedToId)?.fullName || '',
      })),
      appointments: visibleAppts.map((ap) => ({
        ...ap,
        companyName: companyMap.get(ap.companyId)?.name || '',
        repName: userMap.get(ap.assignedToId)?.fullName || '',
      })),
    });
  } catch (error) {
    console.error('Get campaign detail error:', error);
    res.status(500).json({ error: 'Failed to load campaign details.' });
  }
});

dataRouter.patch('/campaigns/:id', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const campaignId = Number(req.params.id);
    const [existing] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Campaign not found.' });

    const body = req.body as Record<string, any>;
    const instructionsChanged = body.instructions !== undefined && body.instructions !== existing.instructions;

    const [updated] = await db
      .update(campaigns)
      .set({
        name: body.name !== undefined ? String(body.name).trim() : existing.name,
        description: body.description !== undefined ? body.description : existing.description,
        clientName: body.clientName !== undefined ? body.clientName : existing.clientName,
        objective: body.objective !== undefined ? body.objective : existing.objective,
        targetIndustry: body.targetIndustry !== undefined ? body.targetIndustry : existing.targetIndustry,
        targetCountries: body.targetCountries !== undefined ? body.targetCountries : existing.targetCountries,
        targetJobTitles: body.targetJobTitles !== undefined ? body.targetJobTitles : existing.targetJobTitles,
        targetCompanySize: body.targetCompanySize !== undefined ? body.targetCompanySize : existing.targetCompanySize,
        startDate: body.startDate !== undefined ? body.startDate : existing.startDate,
        endDate: body.endDate !== undefined ? body.endDate : existing.endDate,
        status: body.status !== undefined ? body.status : existing.status,
        targetCompaniesCount:
          body.targetCompaniesCount !== undefined ? Number(body.targetCompaniesCount) : existing.targetCompaniesCount,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        instructions: body.instructions !== undefined ? body.instructions : existing.instructions,
        qualificationCriteria:
          body.qualificationCriteria !== undefined ? body.qualificationCriteria : existing.qualificationCriteria,
        qualificationQuestions:
          body.qualificationQuestions !== undefined ? body.qualificationQuestions : existing.qualificationQuestions,
        allowDuplicateAssignments:
          body.allowDuplicateAssignments !== undefined
            ? Boolean(body.allowDuplicateAssignments)
            : existing.allowDuplicateAssignments,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, campaignId))
      .returning();

    if (instructionsChanged) {
      const members = await db.select().from(campaignMembers).where(eq(campaignMembers.campaignId, campaignId));
      for (const m of members) {
        await createNotification({
          userId: m.userId,
          type: 'CAMPAIGN_INSTRUCTIONS_UPDATED',
          title: `Campaign Instructions Updated: ${updated.name}`,
          message: 'Campaign playbook and qualification guidelines were updated.',
          entityType: 'campaign',
          entityId: updated.id,
          linkPath: `/campaigns/${updated.id}`,
        });
      }
    }

    await logAudit({
      user: req.currentUser,
      action: 'CAMPAIGN_UPDATED',
      entity: 'campaign',
      entityId: campaignId,
      previousValue: { status: existing.status, name: existing.name },
      newValue: { status: updated.status, name: updated.name },
    });

    res.json({ campaign: updated });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Failed to update campaign.' });
  }
});

dataRouter.post('/campaigns/:id/members', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const campaignId = Number(req.params.id);
    const { userId, allocatedQuota } = req.body as { userId: number; allocatedQuota?: number };
    if (!userId) return res.status(400).json({ error: 'userId is required.' });

    await db
      .insert(campaignMembers)
      .values({ campaignId, userId: Number(userId), memberRole: 'SALES_REP', allocatedQuota: Number(allocatedQuota || 0) })
      .onConflictDoUpdate({
        target: [campaignMembers.campaignId, campaignMembers.userId],
        set: { allocatedQuota: Number(allocatedQuota || 0) },
      });

    await createNotification({
      userId: Number(userId),
      type: 'CAMPAIGN_ASSIGNMENT',
      title: 'Added to Campaign Team',
      message: `You have been assigned to campaign #${campaignId}.`,
      entityType: 'campaign',
      entityId: campaignId,
      linkPath: `/campaigns/${campaignId}`,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Add campaign member error:', error);
    res.status(500).json({ error: 'Failed to update campaign team.' });
  }
});

// ==================== COMPANIES & CONTACTS ====================
dataRouter.get('/companies', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const search = String(req.query.search || '').trim().toLowerCase();
    const industry = String(req.query.industry || '').trim();
    const country = String(req.query.country || '').trim();
    const validation = String(req.query.validation || '').trim();

    const [allCompanies, allContacts, allCCRs] = await Promise.all([
      db.select().from(companies).orderBy(desc(companies.createdAt)),
      db.select().from(contacts),
      db.select().from(campaignCompanyRecords),
    ]);

    let allowedCompanyIds: Set<number> | null = null;
    if (user.role === 'SALES_REP') {
      allowedCompanyIds = new Set(allCCRs.filter((r) => r.assignedToId === user.id).map((r) => r.companyId));
    }

    const filtered = allCompanies.filter((c) => {
      if (allowedCompanyIds && !allowedCompanyIds.has(c.id)) return false;
      if (industry && c.industry !== industry) return false;
      if (country && c.country !== country) return false;
      if (validation && c.validationStatus !== validation) return false;
      if (search) {
        const hay = `${c.name} ${c.domain || ''} ${c.industry || ''} ${c.country || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    const enriched = filtered.map((c) => {
      const cContacts = allContacts.filter((ct) => ct.companyId === c.id);
      const cCampaigns = allCCRs.filter((r) => r.companyId === c.id);
      return {
        ...c,
        contactsCount: cContacts.length,
        campaignsCount: cCampaigns.length,
      };
    });

    res.json({ companies: enriched });
  } catch (error) {
    console.error('List companies error:', error);
    res.status(500).json({ error: 'Failed to fetch companies.' });
  }
});

dataRouter.post('/companies', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, any>;
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Company name is required.' });

    const normDomain = normalizeDomain(body.domain || body.website);
    const normName = normalizeCompanyName(name);
    const normLinkedin = normalizeLinkedin(body.linkedinUrl);

    const allCompanies = await db.select().from(companies);
    const duplicate = allCompanies.find(
      (c) =>
        (normDomain && c.normalizedDomain === normDomain) ||
        (normLinkedin && c.normalizedLinkedin === normLinkedin) ||
        (normName && c.normalizedName === normName)
    );

    if (duplicate && !body.allowReuse) {
      return res.status(409).json({
        error: `Duplicate company detected: "${duplicate.name}" (${duplicate.domain || 'no domain'}) already exists in the centralized database.`,
        duplicateCompany: duplicate,
      });
    }

    const scores = computeRecordQualityScores({
      companyName: name,
      website: body.website,
      domain: body.domain || normDomain || undefined,
      linkedinUrl: body.linkedinUrl,
      industry: body.industry,
      employeeSize: body.employeeSize,
      country: body.country,
      providedAiScore: body.aiScore,
      providedFitScore: body.fitScore,
    });

    const [created] = await db
      .insert(companies)
      .values({
        name,
        normalizedName: normName,
        website: normalizeWebsite(body.website || body.domain),
        domain: normDomain,
        normalizedDomain: normDomain,
        linkedinUrl: body.linkedinUrl || null,
        normalizedLinkedin: normLinkedin,
        industry: body.industry || null,
        employeeSize: body.employeeSize || null,
        country: body.country || null,
        state: body.state || null,
        city: body.city || null,
        revenue: body.revenue || null,
        description: body.description || null,
        aiScore: scores.aiScore,
        fitScore: scores.fitScore,
        dataSource: body.dataSource || 'Manual',
        validationStatus: scores.validationStatus,
        createdById: req.currentUser!.id,
      })
      .returning();

    if (body.campaignId) {
      await db
        .insert(campaignCompanyRecords)
        .values({
          campaignId: Number(body.campaignId),
          companyId: created.id,
          isApproved: true,
          status: 'NOT_YET_WORKED',
        })
        .onConflictDoNothing();
    }

    await logAudit({
      user: req.currentUser,
      action: 'COMPANY_CREATED',
      entity: 'company',
      entityId: created.id,
      newValue: { name: created.name, domain: created.domain },
    });

    res.status(201).json({ company: created });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ error: 'Failed to create company.' });
  }
});

dataRouter.get('/companies/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const companyId = Number(req.params.id);
    const user = req.currentUser!;
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    const [companyContacts, ccrRows, companyActivities, allCampaigns, allUsers] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.companyId, companyId)),
      db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.companyId, companyId)),
      db.select().from(activities).where(eq(activities.companyId, companyId)).orderBy(desc(activities.createdAt)),
      db.select().from(campaigns),
      db.select().from(users),
    ]);

    if (user.role === 'SALES_REP') {
      const assigned = ccrRows.some((r) => r.assignedToId === user.id);
      if (!assigned) {
        return res.status(403).json({ error: 'You do not have access to this company.' });
      }
    }

    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    res.json({
      company,
      contacts: companyContacts,
      campaignHistory: ccrRows
        .filter((r) => user.role !== 'SALES_REP' || r.assignedToId === user.id)
        .map((r) => ({
          ...r,
          campaignName: campaignMap.get(r.campaignId) || 'Campaign',
          assignedToName: r.assignedToId ? userMap.get(r.assignedToId) || null : null,
        })),
      activities: companyActivities
        .filter((a) => user.role !== 'SALES_REP' || a.createdById === user.id)
        .map((a) => ({
          ...a,
          campaignName: campaignMap.get(a.campaignId) || '',
          repName: userMap.get(a.createdById) || '',
        })),
    });
  } catch (error) {
    console.error('Company detail error:', error);
    res.status(500).json({ error: 'Failed to load company profile.' });
  }
});

dataRouter.get('/contacts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    const search = String(req.query.search || '').trim().toLowerCase();

    const [allContacts, allCompanies, allCCRs] = await Promise.all([
      db.select().from(contacts).orderBy(desc(contacts.createdAt)),
      db.select().from(companies),
      db.select().from(campaignCompanyRecords),
    ]);

    const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
    let allowedCompanyIds: Set<number> | null = null;
    if (user.role === 'SALES_REP') {
      allowedCompanyIds = new Set(allCCRs.filter((r) => r.assignedToId === user.id).map((r) => r.companyId));
    }

    const filtered = allContacts.filter((ct) => {
      if (allowedCompanyIds && !allowedCompanyIds.has(ct.companyId)) return false;
      if (search) {
        const comp = companyMap.get(ct.companyId);
        const hay = `${ct.fullName} ${ct.workEmail || ''} ${ct.jobTitle || ''} ${comp?.name || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    res.json({
      contacts: filtered.map((ct) => ({
        ...ct,
        companyName: companyMap.get(ct.companyId)?.name || '',
        companyDomain: companyMap.get(ct.companyId)?.domain || '',
      })),
    });
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'Failed to load contacts.' });
  }
});

dataRouter.post('/contacts', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const body = req.body as Record<string, any>;
    const companyId = Number(body.companyId);
    const fullName =
      String(body.fullName || '').trim() ||
      `${String(body.firstName || '').trim()} ${String(body.lastName || '').trim()}`.trim();

    if (!companyId || !fullName) {
      return res.status(400).json({ error: 'Company and contact full name are required.' });
    }

    const normEmail = normalizeEmail(body.workEmail);
    const normLinkedin = normalizeLinkedin(body.linkedinUrl);
    const normPhone = normalizePhone(body.phone);

    const existingContacts = await db.select().from(contacts);
    const dup = existingContacts.find(
      (ct) =>
        (normEmail && ct.normalizedEmail === normEmail) ||
        (normLinkedin && ct.normalizedLinkedin === normLinkedin) ||
        (normPhone && ct.normalizedPhone === normPhone)
    );
    if (dup) {
      return res.status(409).json({
        error: `Duplicate contact detected: "${dup.fullName}" already exists (${dup.workEmail || dup.linkedinUrl || dup.phone}).`,
      });
    }

    const [created] = await db
      .insert(contacts)
      .values({
        companyId,
        firstName: body.firstName || fullName.split(' ')[0] || null,
        lastName: body.lastName || fullName.split(' ').slice(1).join(' ') || null,
        fullName,
        jobTitle: body.jobTitle || null,
        department: body.department || null,
        seniority: body.seniority || null,
        workEmail: body.workEmail || null,
        normalizedEmail: normEmail,
        phone: body.phone || null,
        normalizedPhone: normPhone,
        linkedinUrl: body.linkedinUrl || null,
        normalizedLinkedin: normLinkedin,
        country: body.country || null,
        dataSource: body.dataSource || 'Manual',
        aiScore: Number(body.aiScore || 80),
        fitScore: Number(body.fitScore || 80),
        validationStatus: normEmail ? 'VALID' : 'MISSING_INFO',
        createdById: req.currentUser!.id,
      })
      .returning();

    // Link contact into any campaigns where this company is already active
    const companyCCRs = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.companyId, companyId));
    for (const ccr of companyCCRs) {
      await db
        .insert(campaignContactRecords)
        .values({
          campaignId: ccr.campaignId,
          campaignCompanyRecordId: ccr.id,
          companyId,
          contactId: created.id,
          status: 'NOT_YET_WORKED',
          assignedToId: ccr.assignedToId,
        })
        .onConflictDoNothing();
    }

    res.status(201).json({ contact: created });
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Failed to create contact.' });
  }
});

// ==================== DATA IMPORT & DUPLICATE DETECTION ====================
interface MappedRow {
  rowNumber: number;
  companyName?: string;
  website?: string;
  domain?: string;
  companyLinkedinUrl?: string;
  industry?: string;
  employeeSize?: string;
  country?: string;
  state?: string;
  city?: string;
  revenue?: string;
  description?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  jobTitle?: string;
  department?: string;
  seniority?: string;
  workEmail?: string;
  phone?: string;
  contactLinkedinUrl?: string;
  aiScore?: string | number;
  fitScore?: string | number;
}

dataRouter.post('/imports/preview', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const { campaignId, rows } = req.body as { campaignId?: number; rows: MappedRow[] };
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows provided for preview.' });
    }

    const [allCompanies, allContacts, allCCRs, allCampaigns, allUsers, allActivities] = await Promise.all([
      db.select().from(companies),
      db.select().from(contacts),
      db.select().from(campaignCompanyRecords),
      db.select().from(campaigns),
      db.select().from(users),
      db.select().from(activities),
    ]);

    const campaignMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));

    const seenDomainsInBatch = new Set<string>();
    const seenEmailsInBatch = new Set<string>();

    const analyzed = rows.map((row, index) => {
      const rowNumber = row.rowNumber || index + 1;
      const compName = (row.companyName || '').trim();
      const normDomain = normalizeDomain(row.domain || row.website);
      const normName = normalizeCompanyName(compName);
      const normCompLi = normalizeLinkedin(row.companyLinkedinUrl);
      const normEmail = normalizeEmail(row.workEmail);
      const normPhone = normalizePhone(row.phone);
      const normContactLi = normalizeLinkedin(row.contactLinkedinUrl);

      const quality = computeRecordQualityScores({
        companyName: compName,
        website: row.website,
        domain: normDomain || row.domain,
        linkedinUrl: row.companyLinkedinUrl,
        industry: row.industry,
        employeeSize: row.employeeSize,
        country: row.country,
        workEmail: row.workEmail,
        phone: row.phone,
        jobTitle: row.jobTitle,
        providedAiScore: row.aiScore,
        providedFitScore: row.fitScore,
      });

      const existingCompany = allCompanies.find(
        (c) =>
          (normDomain && c.normalizedDomain === normDomain) ||
          (normCompLi && c.normalizedLinkedin === normCompLi) ||
          (normName && c.normalizedName === normName)
      );

      const existingContact = allContacts.find(
        (ct) =>
          (normEmail && ct.normalizedEmail === normEmail) ||
          (normContactLi && ct.normalizedLinkedin === normContactLi) ||
          (normPhone && ct.normalizedPhone === normPhone)
      );

      const batchDomainDup = Boolean(normDomain && seenDomainsInBatch.has(normDomain));
      const batchEmailDup = Boolean(normEmail && seenEmailsInBatch.has(normEmail));
      if (normDomain) seenDomainsInBatch.add(normDomain);
      if (normEmail) seenEmailsInBatch.add(normEmail);

      let duplicateInfo: Record<string, any> | null = null;
      if (existingCompany || existingContact || batchDomainDup || batchEmailDup) {
        const compId = existingCompany?.id ?? existingContact?.companyId;
        const pastCCRs = compId ? allCCRs.filter((r) => r.companyId === compId) : [];
        const alreadyInTargetCampaign = campaignId ? pastCCRs.some((r) => r.campaignId === Number(campaignId)) : false;
        const pastActs = compId ? allActivities.filter((a) => a.companyId === compId) : [];

        duplicateInfo = {
          matchType: existingCompany
            ? existingCompany.normalizedDomain === normDomain
              ? 'Company Domain'
              : existingCompany.normalizedLinkedin === normCompLi
                ? 'Company LinkedIn'
                : 'Company Name'
            : existingContact
              ? existingContact.normalizedEmail === normEmail
                ? 'Contact Email'
                : existingContact.normalizedLinkedin === normContactLi
                  ? 'Contact LinkedIn'
                  : 'Contact Phone'
              : 'Duplicate Within File',
          existingCompanyId: existingCompany?.id ?? null,
          existingCompanyName: existingCompany?.name ?? null,
          existingContactId: existingContact?.id ?? null,
          existingContactName: existingContact?.fullName ?? null,
          alreadyInTargetCampaign,
          previousCampaigns: pastCCRs.map((r) => ({
            campaignId: r.campaignId,
            campaignName: campaignMap.get(r.campaignId) || 'Campaign',
            status: r.status,
            assignedTo: r.assignedToId ? userMap.get(r.assignedToId) || 'Rep' : 'Unassigned',
          })),
          previousOutreachCount: pastActs.length,
          lastOutcome: pastActs[0]?.outcome || pastCCRs[0]?.lastOutcome || null,
        };
      }

      return {
        rowNumber,
        raw: row,
        validationStatus: quality.validationStatus,
        issues: quality.issues,
        aiScore: quality.aiScore,
        fitScore: quality.fitScore,
        isDuplicate: Boolean(duplicateInfo),
        duplicateInfo,
      };
    });

    res.json({
      summary: {
        totalRows: analyzed.length,
        validNewRows: analyzed.filter((r) => r.validationStatus !== 'INVALID' && !r.isDuplicate).length,
        duplicatesDetected: analyzed.filter((r) => r.isDuplicate).length,
        invalidRows: analyzed.filter((r) => r.validationStatus === 'INVALID').length,
        missingInfoRows: analyzed.filter((r) => r.validationStatus === 'MISSING_INFO').length,
      },
      rows: analyzed,
    });
  } catch (error) {
    console.error('Import preview error:', error);
    res.status(500).json({ error: 'Failed to analyze import dataset.' });
  }
});

dataRouter.post('/imports/commit', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const {
      fileName,
      dataSource,
      campaignId,
      columnMapping,
      rows,
      duplicatePolicy = 'REUSE_IN_CAMPAIGN', // REUSE_IN_CAMPAIGN | SKIP_DUPLICATE
    } = req.body as {
      fileName: string;
      dataSource: string;
      campaignId?: number | null;
      columnMapping?: Record<string, string>;
      rows: MappedRow[];
      duplicatePolicy?: 'REUSE_IN_CAMPAIGN' | 'SKIP_DUPLICATE';
    };

    if (!fileName || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'File name and rows are required.' });
    }

    const batchCountRes = await db.select({ count: sql<number>`count(*)::int` }).from(importBatches);
    const batchCode = `IMP-${new Date().getFullYear()}-${String((batchCountRes[0]?.count ?? 0) + 1).padStart(3, '0')}`;

    const [batch] = await db
      .insert(importBatches)
      .values({
        batchCode,
        fileName,
        dataSource: dataSource || 'CSV',
        campaignId: campaignId ? Number(campaignId) : null,
        importedById: req.currentUser!.id,
        totalRows: rows.length,
        columnMapping: columnMapping || {},
        status: 'PROCESSING',
      })
      .returning();

    const allCompanies = await db.select().from(companies);
    const allContacts = await db.select().from(contacts);

    let importedCompaniesCount = 0;
    let importedContactsCount = 0;
    let duplicatesCount = 0;
    let invalidCount = 0;
    let missingInfoCount = 0;
    const invalidReport: Array<Record<string, unknown>> = [];
    const duplicateReport: Array<Record<string, unknown>> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const rowNumber = row.rowNumber || i + 1;
      const compName = (row.companyName || '').trim();
      const normDomain = normalizeDomain(row.domain || row.website);
      const normName = normalizeCompanyName(compName);
      const normCompLi = normalizeLinkedin(row.companyLinkedinUrl);
      const normEmail = normalizeEmail(row.workEmail);
      const normPhone = normalizePhone(row.phone);
      const normContactLi = normalizeLinkedin(row.contactLinkedinUrl);

      const quality = computeRecordQualityScores({
        companyName: compName,
        website: row.website,
        domain: normDomain || row.domain,
        linkedinUrl: row.companyLinkedinUrl,
        industry: row.industry,
        employeeSize: row.employeeSize,
        country: row.country,
        workEmail: row.workEmail,
        phone: row.phone,
        jobTitle: row.jobTitle,
        providedAiScore: row.aiScore,
        providedFitScore: row.fitScore,
      });

      if (quality.validationStatus === 'INVALID') {
        invalidCount++;
        invalidReport.push({ rowNumber, companyName: compName || '(empty)', issues: quality.issues });
        await db.insert(importRecords).values({
          batchId: batch.id,
          rowNumber,
          outcome: 'INVALID',
          details: quality.issues.join('; '),
          rawPayload: row,
        });
        continue;
      }

      if (quality.validationStatus === 'MISSING_INFO') {
        missingInfoCount++;
      }

      // Check existing company
      let companyRecord = allCompanies.find(
        (c) =>
          (normDomain && c.normalizedDomain === normDomain) ||
          (normCompLi && c.normalizedLinkedin === normCompLi) ||
          (normName && c.normalizedName === normName)
      );

      let companyWasDuplicate = Boolean(companyRecord);
      if (!companyRecord) {
        const [insertedComp] = await db
          .insert(companies)
          .values({
            name: compName,
            normalizedName: normName,
            website: normalizeWebsite(row.website || row.domain),
            domain: normDomain,
            normalizedDomain: normDomain,
            linkedinUrl: row.companyLinkedinUrl || null,
            normalizedLinkedin: normCompLi,
            industry: row.industry || null,
            employeeSize: row.employeeSize || null,
            country: row.country || null,
            state: row.state || null,
            city: row.city || null,
            revenue: row.revenue || null,
            description: row.description || null,
            aiScore: quality.aiScore,
            fitScore: quality.fitScore,
            dataSource: dataSource || 'CSV',
            validationStatus: quality.validationStatus,
            createdById: req.currentUser!.id,
          })
          .returning();
        companyRecord = insertedComp;
        allCompanies.push(insertedComp);
        importedCompaniesCount++;
      }

      // Handle contact if present
      const contactFullName =
        (row.fullName || '').trim() ||
        `${(row.firstName || '').trim()} ${(row.lastName || '').trim()}`.trim();

      let contactRecord = null;
      let contactWasDuplicate = false;

      if (contactFullName || normEmail || normContactLi) {
        contactRecord = allContacts.find(
          (ct) =>
            (normEmail && ct.normalizedEmail === normEmail) ||
            (normContactLi && ct.normalizedLinkedin === normContactLi) ||
            (normPhone && ct.normalizedPhone === normPhone)
        );
        contactWasDuplicate = Boolean(contactRecord);

        if (!contactRecord && contactFullName) {
          const [insertedCt] = await db
            .insert(contacts)
            .values({
              companyId: companyRecord.id,
              firstName: row.firstName || contactFullName.split(' ')[0] || null,
              lastName: row.lastName || contactFullName.split(' ').slice(1).join(' ') || null,
              fullName: contactFullName,
              jobTitle: row.jobTitle || null,
              department: row.department || null,
              seniority: row.seniority || null,
              workEmail: row.workEmail || null,
              normalizedEmail: normEmail,
              phone: row.phone || null,
              normalizedPhone: normPhone,
              linkedinUrl: row.contactLinkedinUrl || null,
              normalizedLinkedin: normContactLi,
              country: row.country || null,
              dataSource: dataSource || 'CSV',
              aiScore: quality.aiScore,
              fitScore: quality.fitScore,
              validationStatus: normEmail ? 'VALID' : 'MISSING_INFO',
              createdById: req.currentUser!.id,
            })
            .returning();
          contactRecord = insertedCt;
          allContacts.push(insertedCt);
          importedContactsCount++;
        }
      }

      const isDup = companyWasDuplicate || contactWasDuplicate;
      if (isDup) {
        duplicatesCount++;
        duplicateReport.push({
          rowNumber,
          companyName: companyRecord.name,
          contactName: contactRecord?.fullName || contactFullName || null,
          action: duplicatePolicy === 'REUSE_IN_CAMPAIGN' ? 'Reused centralized record' : 'Skipped duplicate',
        });
      }

      // Attach to target campaign if specified
      if (campaignId && (!isDup || duplicatePolicy === 'REUSE_IN_CAMPAIGN')) {
        const [existingCCR] = await db
          .select()
          .from(campaignCompanyRecords)
          .where(
            and(
              eq(campaignCompanyRecords.campaignId, Number(campaignId)),
              eq(campaignCompanyRecords.companyId, companyRecord.id)
            )
          )
          .limit(1);

        let ccr = existingCCR;
        if (!ccr) {
          const [createdCCR] = await db
            .insert(campaignCompanyRecords)
            .values({
              campaignId: Number(campaignId),
              companyId: companyRecord.id,
              importBatchId: batch.id,
              isApproved: true,
              status: 'NOT_YET_WORKED',
            })
            .returning();
          ccr = createdCCR;
        }

        if (contactRecord) {
          await db
            .insert(campaignContactRecords)
            .values({
              campaignId: Number(campaignId),
              campaignCompanyRecordId: ccr.id,
              companyId: companyRecord.id,
              contactId: contactRecord.id,
              status: 'NOT_YET_WORKED',
              assignedToId: ccr.assignedToId,
            })
            .onConflictDoNothing();
        }
      }

      await db.insert(importRecords).values({
        batchId: batch.id,
        rowNumber,
        companyId: companyRecord.id,
        contactId: contactRecord?.id ?? null,
        outcome: isDup
          ? duplicatePolicy === 'REUSE_IN_CAMPAIGN'
            ? 'REUSED_DUPLICATE'
            : 'SKIPPED_DUPLICATE'
          : quality.validationStatus === 'MISSING_INFO'
            ? 'MISSING_INFO'
            : 'CREATED',
        details: isDup ? 'Matched existing centralized record' : quality.issues.join('; ') || 'Imported cleanly',
      });
    }

    const [finalBatch] = await db
      .update(importBatches)
      .set({
        importedCompanies: importedCompaniesCount,
        importedContacts: importedContactsCount,
        duplicatesDetected: duplicatesCount,
        invalidRows: invalidCount,
        missingInfoRows: missingInfoCount,
        invalidReport,
        duplicateReport,
        status: 'COMPLETED',
      })
      .where(eq(importBatches.id, batch.id))
      .returning();

    await logAudit({
      user: req.currentUser,
      action: 'DATA_IMPORTED',
      entity: 'import_batch',
      entityId: finalBatch.id,
      newValue: {
        batchCode: finalBatch.batchCode,
        fileName: finalBatch.fileName,
        importedCompanies: importedCompaniesCount,
        importedContacts: importedContactsCount,
        duplicatesDetected: duplicatesCount,
      },
    });

    res.status(201).json({ batch: finalBatch });
  } catch (error) {
    console.error('Import commit error:', error);
    res.status(500).json({ error: 'Failed to commit data import.' });
  }
});

dataRouter.get('/imports', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER'), async (_req, res) => {
  try {
    const [batches, allUsers, allCampaigns] = await Promise.all([
      db.select().from(importBatches).orderBy(desc(importBatches.createdAt)),
      db.select().from(users),
      db.select().from(campaigns),
    ]);
    const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));
    const cmpMap = new Map(allCampaigns.map((c) => [c.id, c.name]));

    res.json({
      batches: batches.map((b) => ({
        ...b,
        importedByName: userMap.get(b.importedById) || 'User',
        campaignName: b.campaignId ? cmpMap.get(b.campaignId) || 'Campaign' : 'Central Pool',
      })),
    });
  } catch (error) {
    console.error('List imports error:', error);
    res.status(500).json({ error: 'Failed to load import history.' });
  }
});

// ==================== DATA DISTRIBUTION & ASSIGNMENT ====================
dataRouter.get(
  '/distribution/campaigns/:campaignId',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req, res) => {
    try {
      const campaignId = Number(req.params.campaignId);
      const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
      if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

      const [ccrRows, allCompanies, allContacts, allUsers, historyRows] = await Promise.all([
        db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.campaignId, campaignId)),
        db.select().from(companies),
        db.select().from(contacts),
        db.select().from(users),
        db.select().from(assignmentHistory).where(eq(assignmentHistory.campaignId, campaignId)).orderBy(desc(assignmentHistory.createdAt)),
      ]);

      const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const salesReps = allUsers.filter((u) => u.role === 'SALES_REP' && u.isActive);

      const repBreakdown = salesReps.map((rep) => {
        const repRows = ccrRows.filter((r) => r.assignedToId === rep.id);
        return {
          repId: rep.id,
          fullName: rep.fullName,
          email: rep.email,
          assignedCount: repRows.length,
          workedCount: repRows.filter((r) => r.status !== 'NOT_YET_WORKED').length,
          pendingCount: repRows.filter((r) => r.status === 'NOT_YET_WORKED').length,
        };
      });

      res.json({
        campaign,
        stats: {
          totalAvailable: ccrRows.length,
          approvedCount: ccrRows.filter((r) => r.isApproved).length,
          distributedCount: ccrRows.filter((r) => r.assignedToId !== null).length,
          remainingUnassigned: ccrRows.filter((r) => r.assignedToId === null && r.isApproved).length,
          workedCount: ccrRows.filter((r) => r.status !== 'NOT_YET_WORKED').length,
          pendingCount: ccrRows.filter((r) => r.assignedToId !== null && r.status === 'NOT_YET_WORKED').length,
        },
        repBreakdown,
        records: ccrRows.map((r) => {
          const comp = companyMap.get(r.companyId);
          const compContacts = allContacts.filter((ct) => ct.companyId === r.companyId);
          return {
            ...r,
            companyName: comp?.name || 'Unknown',
            domain: comp?.domain || '',
            industry: comp?.industry || '',
            country: comp?.country || '',
            aiScore: comp?.aiScore ?? 0,
            fitScore: comp?.fitScore ?? 0,
            contactsCount: compContacts.length,
            assignedToName: r.assignedToId ? userMap.get(r.assignedToId)?.fullName || null : null,
          };
        }),
        history: historyRows.slice(0, 50).map((h) => ({
          ...h,
          previousAssigneeName: h.previousAssigneeId ? userMap.get(h.previousAssigneeId)?.fullName || null : null,
          newAssigneeName: userMap.get(h.newAssigneeId)?.fullName || 'Rep',
          changedByName: userMap.get(h.changedById)?.fullName || 'Manager',
        })),
      });
    } catch (error) {
      console.error('Distribution overview error:', error);
      res.status(500).json({ error: 'Failed to load campaign distribution.' });
    }
  }
);

dataRouter.post('/distribution/assign', requireAuth, requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'), async (req: AuthRequest, res) => {
  try {
    const {
      campaignId,
      allocations, // Array<{ repId: number; count?: number; recordIds?: number[] }>
      distributionDate,
      deadline,
      instructions,
    } = req.body as {
      campaignId: number;
      allocations: Array<{ repId: number; count?: number; recordIds?: number[] }>;
      distributionDate?: string;
      deadline?: string;
      instructions?: string;
    };

    if (!campaignId || !Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({ error: 'Campaign and at least one representative allocation are required.' });
    }

    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, Number(campaignId))).limit(1);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found.' });

    const allCCRs = await db
      .select()
      .from(campaignCompanyRecords)
      .where(eq(campaignCompanyRecords.campaignId, campaign.id));

    const unassignedPool = allCCRs.filter((r) => r.isApproved && r.assignedToId === null);
    let poolCursor = 0;
    const distDate = distributionDate || new Date().toISOString().slice(0, 10);
    let totalAssigned = 0;

    for (const alloc of allocations) {
      const repId = Number(alloc.repId);
      let targetRecords: typeof allCCRs = [];

      if (Array.isArray(alloc.recordIds) && alloc.recordIds.length > 0) {
        const idSet = new Set(alloc.recordIds.map(Number));
        targetRecords = allCCRs.filter((r) => {
          if (!idSet.has(r.id)) return false;
          if (r.assignedToId !== null && !campaign.allowDuplicateAssignments) return false;
          return true;
        });
      } else if (alloc.count && alloc.count > 0) {
        const take = Math.min(Number(alloc.count), unassignedPool.length - poolCursor);
        if (take > 0) {
          targetRecords = unassignedPool.slice(poolCursor, poolCursor + take);
          poolCursor += take;
        }
      }

      if (targetRecords.length === 0) continue;

      await db
        .insert(campaignMembers)
        .values({ campaignId: campaign.id, userId: repId, memberRole: 'SALES_REP' })
        .onConflictDoNothing();

      for (const rec of targetRecords) {
        await db
          .update(campaignCompanyRecords)
          .set({
            assignedToId: repId,
            assignedById: req.currentUser!.id,
            assignedAt: new Date(),
            dueDate: deadline || rec.dueDate,
            assignmentInstructions: instructions || rec.assignmentInstructions,
            updatedAt: new Date(),
          })
          .where(eq(campaignCompanyRecords.id, rec.id));

        await db
          .update(campaignContactRecords)
          .set({ assignedToId: repId, updatedAt: new Date() })
          .where(eq(campaignContactRecords.campaignCompanyRecordId, rec.id));

        await db.insert(assignments).values({
          campaignId: campaign.id,
          campaignCompanyRecordId: rec.id,
          assignedToId: repId,
          assignedById: req.currentUser!.id,
          distributionDate: distDate,
          deadline: deadline || null,
          instructions: instructions || null,
          status: 'ACTIVE',
        });

        await db.insert(assignmentHistory).values({
          campaignId: campaign.id,
          campaignCompanyRecordId: rec.id,
          previousAssigneeId: rec.assignedToId,
          newAssigneeId: repId,
          changedById: req.currentUser!.id,
          action: 'ASSIGNED',
          reason: instructions || 'Campaign data distribution',
        });

        totalAssigned++;
      }

      await createNotification({
        userId: repId,
        type: 'DATA_ASSIGNED',
        title: `New Data Assigned: ${campaign.name}`,
        message: `${targetRecords.length} company record(s) have been assigned to your workspace.`,
        entityType: 'campaign',
        entityId: campaign.id,
        linkPath: '/workspace',
      });
    }

    await logAudit({
      user: req.currentUser,
      action: 'DATA_ASSIGNED',
      entity: 'campaign',
      entityId: campaign.id,
      newValue: { totalAssigned, distributionDate: distDate },
    });

    res.json({ ok: true, totalAssigned });
  } catch (error) {
    console.error('Assign distribution error:', error);
    res.status(500).json({ error: 'Failed to distribute campaign data.' });
  }
});

dataRouter.post(
  '/distribution/reassign',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const { recordIds, newRepId, reason } = req.body as {
        recordIds: number[];
        newRepId: number;
        reason?: string;
      };
      if (!Array.isArray(recordIds) || recordIds.length === 0 || !newRepId) {
        return res.status(400).json({ error: 'recordIds and newRepId are required.' });
      }

      const records = await db
        .select()
        .from(campaignCompanyRecords)
        .where(inArray(campaignCompanyRecords.id, recordIds.map(Number)));

      for (const rec of records) {
        if (rec.assignedToId === Number(newRepId)) continue;

        await db
          .update(assignments)
          .set({ status: 'REASSIGNED' })
          .where(and(eq(assignments.campaignCompanyRecordId, rec.id), eq(assignments.status, 'ACTIVE')));

        await db
          .update(campaignCompanyRecords)
          .set({
            assignedToId: Number(newRepId),
            assignedById: req.currentUser!.id,
            assignedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(campaignCompanyRecords.id, rec.id));

        await db
          .update(campaignContactRecords)
          .set({ assignedToId: Number(newRepId), updatedAt: new Date() })
          .where(eq(campaignContactRecords.campaignCompanyRecordId, rec.id));

        await db.insert(assignments).values({
          campaignId: rec.campaignId,
          campaignCompanyRecordId: rec.id,
          assignedToId: Number(newRepId),
          assignedById: req.currentUser!.id,
          distributionDate: new Date().toISOString().slice(0, 10),
          instructions: reason || 'Reassigned record (previous activity history preserved)',
          status: 'ACTIVE',
        });

        await db.insert(assignmentHistory).values({
          campaignId: rec.campaignId,
          campaignCompanyRecordId: rec.id,
          previousAssigneeId: rec.assignedToId,
          newAssigneeId: Number(newRepId),
          changedById: req.currentUser!.id,
          action: 'REASSIGNED',
          reason: reason || 'Manager reassignment',
        });
      }

      await createNotification({
        userId: Number(newRepId),
        type: 'RECORD_REASSIGNED',
        title: `${records.length} Prospect Record(s) Reassigned to You`,
        message: reason || 'Please review your updated prospecting queue.',
        linkPath: '/workspace',
      });

      await logAudit({
        user: req.currentUser,
        action: 'DATA_REASSIGNED',
        entity: 'campaign_company_records',
        entityId: recordIds.join(','),
        newValue: { newRepId: Number(newRepId), count: records.length, reason },
      });

      res.json({ ok: true, reassignedCount: records.length });
    } catch (error) {
      console.error('Reassign error:', error);
      res.status(500).json({ error: 'Failed to reassign records.' });
    }
  }
);
