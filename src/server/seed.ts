import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  users,
  prospectStatuses,
  appSettings,
  campaigns,
  campaignMembers,
  companies,
  contacts,
  importBatches,
  importRecords,
  campaignCompanyRecords,
  campaignContactRecords,
  assignments,
  assignmentHistory,
  activities,
  followUps,
  appointments,
  dataRequests,
  notifications,
  auditLogs,
  leaveRequests,
  dncSuppression,
  outreachTemplates,
  sequences,
  sequenceSteps,
  dataFlags,
  prospectRemarks,
  deals,
} from '../db/schema.ts';
import { hashPassword } from './auth.ts';
import { DEFAULT_OUTCOME_RULES } from './workflow.ts';
import { normalizeCompanyName, normalizeDomain, normalizeEmail, normalizeLinkedin, normalizePhone } from './normalization.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      seedPromise = null;
      console.error('Database seed error:', err);
    });
  }
  return seedPromise;
}

function daysOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function ensureDemoAccounts(): Promise<void> {
  const existingUsers = await db.select().from(users);
  if (existingUsers.length === 0) return;

  // Ensure a dedicated Campaign Manager demo user exists
  let cameron = existingUsers.find((u) => u.email === 'cameron@cadenceops.io');
  if (!cameron) {
    const [inserted] = await db
      .insert(users)
      .values({
        employeeCode: 'EMP-1007',
        username: 'cameron.hayes',
        email: 'cameron@cadenceops.io',
        fullName: 'Cameron Hayes',
        phone: '+1-415-890-2107',
        department: 'Campaign Operations',
        jobRole: 'Campaign Manager',
        role: 'CAMPAIGN_MANAGER',
        joiningDate: '2024-08-19',
        isActive: true,
      })
      .onConflictDoNothing()
      .returning();
    cameron = inserted;
  }

  if (cameron) {
    const admin = existingUsers.find((u) => u.role === 'SUPER_ADMIN');
    if (admin) {
      await db
        .update(campaigns)
        .set({ campaignManagerId: cameron.id })
        .where(eq(campaigns.campaignManagerId, admin.id));
    }
  }

  const demoPasswords: Record<string, string> = {
    'elena@cadenceops.io': process.env.DEMO_ADMIN_PASSWORD || 'AdminDemo!2026',
    'jordan@cadenceops.io': process.env.DEMO_SALES_PASSWORD || 'SalesDemo!2026',
    'sofia@cadenceops.io': process.env.DEMO_SALES_PASSWORD || 'SalesDemo!2026',
    'devon@cadenceops.io': process.env.DEMO_SALES_PASSWORD || 'SalesDemo!2026',
    'marcus@cadenceops.io': process.env.DEMO_DATA_PASSWORD || 'DataDemo!2026',
    'priya@cadenceops.io': process.env.DEMO_HR_PASSWORD || 'HrDemo!2026',
    'cameron@cadenceops.io': process.env.DEMO_CAMPAIGN_PASSWORD || 'CampaignDemo!2026',
  };

  for (const [email, plain] of Object.entries(demoPasswords)) {
    await db
      .update(users)
      .set({
        passwordHash: hashPassword(plain),
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(sql`${users.email} = ${email} AND ${users.passwordHash} IS NULL`);
  }
}

async function ensureEnterpriseSeed(): Promise<void> {
  const existingTemplates = await db.select({ count: sql<number>`count(*)::int` }).from(outreachTemplates);
  if ((existingTemplates[0]?.count ?? 0) === 0) {
    const allUsers = await db.select().from(users);
    const allCampaigns = await db.select().from(campaigns);
    const allCompanies = await db.select().from(companies);
    const allContacts = await db.select().from(contacts);
    const allCCRs = await db.select().from(campaignCompanyRecords);

    const creator = allUsers.find((u) => u.role === 'CAMPAIGN_MANAGER') || allUsers[0];
    const rep = allUsers.find((u) => u.role === 'SALES_REP') || allUsers[0];
    const cmp1 = allCampaigns[0];

    const insertedTemplates = await db
      .insert(outreachTemplates)
      .values([
        {
          campaignId: cmp1?.id ?? null,
          name: 'IT Security Audit Velocity Intro',
          channel: 'EMAIL',
          subject: 'Quick question on {{company_name}} cloud audit readiness',
          body: 'Hi {{first_name}},\n\nI noticed you lead {{job_title}} initiatives at {{company_name}}. Several infrastructure teams we work with cut manual SOC 2 evidence collection by 60% using automated posture checks.\n\nOpen to a brief 15-minute walkthrough this Thursday?\n\nBest,\n{{sender_name}}',
          createdById: creator?.id ?? null,
        },
        {
          campaignId: null,
          name: 'LinkedIn Executive Connection Follow-up',
          channel: 'LINKEDIN_MESSAGE',
          subject: null,
          body: 'Hi {{first_name}}, thanks for connecting! Saw the growth across {{company_name}} recently—happy to share how peer teams are streamlining outbound & compliance workflows if useful.',
          createdById: creator?.id ?? null,
        },
        {
          campaignId: cmp1?.id ?? null,
          name: 'Cold Call Opener + Objection Script',
          channel: 'CALL_SCRIPT',
          subject: null,
          body: 'OPENER: "Hi {{first_name}}, this is {{sender_name}} calling from CadenceOps. Caught you briefly—do you have 30 seconds?"\n\nHOOK: "We help {{job_title}} leaders at companies like {{company_name}} eliminate cloud config drift before audit cycles."\n\nIF BUSY: "Totally understand—is tomorrow morning or Thursday afternoon better for a 10-minute look?"',
          createdById: creator?.id ?? null,
        },
        {
          campaignId: null,
          name: 'WhatsApp Quick Confirmation',
          channel: 'WHATSAPP',
          subject: null,
          body: 'Hi {{first_name}}, {{sender_name}} here following up on our brief note for {{company_name}}. Would you like me to send over the 2-page case study?',
          createdById: creator?.id ?? null,
        },
      ])
      .returning();

    const [seq] = await db
      .insert(sequences)
      .values({
        campaignId: cmp1?.id ?? null,
        name: '10-Day Enterprise Multi-Channel Cadence',
        description: 'Balanced Phone + Email + LinkedIn executive outreach sequence with automatic reply/meeting stop.',
        stopOnReply: true,
        stopOnAppointment: true,
        createdById: creator?.id ?? null,
      })
      .returning();

    if (seq) {
      await db.insert(sequenceSteps).values([
        {
          sequenceId: seq.id,
          stepOrder: 1,
          delayDays: 0,
          channel: 'PHONE_CALL',
          templateId: insertedTemplates[2]?.id ?? null,
          instructions: 'Initial discovery dial + voicemail if unanswered.',
        },
        {
          sequenceId: seq.id,
          stepOrder: 2,
          delayDays: 2,
          channel: 'EMAIL',
          templateId: insertedTemplates[0]?.id ?? null,
          instructions: 'Send personalized audit velocity intro email.',
        },
        {
          sequenceId: seq.id,
          stepOrder: 3,
          delayDays: 3,
          channel: 'LINKEDIN_CONNECTION',
          templateId: insertedTemplates[1]?.id ?? null,
          instructions: 'Send LinkedIn connection request referencing company milestone.',
        },
        {
          sequenceId: seq.id,
          stepOrder: 4,
          delayDays: 5,
          channel: 'PHONE_CALL',
          templateId: insertedTemplates[2]?.id ?? null,
          instructions: 'Final break-up / reschedule call attempt.',
        },
      ]);
    }

    await db
      .insert(dncSuppression)
      .values([
        {
          type: 'DOMAIN',
          value: 'competitor-blocked.example',
          rawValue: 'competitor-blocked.example',
          reason: 'Direct competitor — global exclusion',
          addedById: creator?.id ?? null,
        },
        {
          type: 'EMAIL',
          value: 'optout@legacysystems.example',
          rawValue: 'optout@legacysystems.example',
          reason: 'GDPR opt-out requested',
          addedById: creator?.id ?? null,
        },
      ])
      .onConflictDoNothing();

    if (allCompanies[0] && rep) {
      await db.insert(dataFlags).values({
        campaignCompanyRecordId: allCCRs[0]?.id ?? null,
        companyId: allCompanies[0].id,
        contactId: allContacts[0]?.id ?? null,
        reportedById: rep.id,
        issueType: 'WRONG_NUMBER',
        proposedFix: '+1-415-555-0199',
        notes: 'Switchboard routed to reception; direct line needed for CTO.',
        status: 'OPEN',
      });
    }

    await db
      .insert(appSettings)
      .values([
        {
          key: 'integrations',
          value: {
            slackWebhookUrl: '',
            notifyOnAppointment: true,
            notifyOnDataRequest: true,
            notifyOnSlaBreach: true,
            defaultTimezone: 'America/New_York',
          },
        },
        {
          key: 'custom_fields',
          value: {
            companyFields: ['Tech Stack', 'Audit Cycle', 'Compliance Framework'],
          },
        },
      ])
      .onConflictDoNothing();
  }

  const remarksCountRes = await db.select({ count: sql<number>`count(*)::int` }).from(prospectRemarks);
  if ((remarksCountRes[0]?.count ?? 0) === 0) {
    const allCCRs = await db.select().from(campaignCompanyRecords);
    const allContacts = await db.select().from(contacts);
    const allUsers = await db.select().from(users);
    const jordan = allUsers.find((u) => u.email === 'jordan@cadenceops.io') || allUsers.find((u) => u.role === 'SALES_REP');
    const sofia = allUsers.find((u) => u.email === 'sofia@cadenceops.io') || jordan;
    const cameron = allUsers.find((u) => u.email === 'cameron@cadenceops.io') || allUsers[0];

    if (allCCRs.length > 0 && jordan) {
      const ccr0 = allCCRs[0]!;
      const ccr1 = allCCRs[1];
      const ccr2 = allCCRs[2];

      await db
        .update(campaignCompanyRecords)
        .set({
          prospectSummary: 'VP Infrastructure & CTO aligned on Q1 SOC 2 automation project; discovery call booked with technical stakeholders.',
          prospectSentiment: 'HOT',
        })
        .where(eq(campaignCompanyRecords.id, ccr0.id));

      const sampleRemarks: Array<{
        campaignId: number;
        campaignCompanyRecordId: number;
        companyId: number;
        contactId: number | null;
        authorId: number;
        category: string;
        content: string;
        isPinned: boolean;
      }> = [
        {
          campaignId: ccr0.campaignId,
          campaignCompanyRecordId: ccr0.id,
          companyId: ccr0.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr0.companyId)?.id ?? null,
          authorId: jordan.id,
          category: 'PAIN_POINT',
          content: 'Manual AWS drift evidence collection is taking their DevOps team ~18 hrs/month before SOC 2 Type II audits.',
          isPinned: true,
        },
        {
          campaignId: ccr0.campaignId,
          campaignCompanyRecordId: ccr0.id,
          companyId: ccr0.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr0.companyId)?.id ?? null,
          authorId: jordan.id,
          category: 'BUDGET_TIMELINE',
          content: 'Security compliance budget resets in January ($35k–$50k range). Claire wants architecture diagram before next call.',
          isPinned: false,
        },
      ];

      if (ccr1) {
        await db
          .update(campaignCompanyRecords)
          .set({
            prospectSummary: 'Interested in drift tooling for Q1; currently evaluating 2 competitors and waiting on our FinTech case study.',
            prospectSentiment: 'WARM',
          })
          .where(eq(campaignCompanyRecords.id, ccr1.id));

        sampleRemarks.push({
          campaignId: ccr1.campaignId,
          campaignCompanyRecordId: ccr1.id,
          companyId: ccr1.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr1.companyId)?.id ?? null,
          authorId: jordan.id,
          category: 'COMPETITOR_STACK',
          content: 'Currently trialing Wiz and homegrown Terraform checks; frustrated by alert noise and lack of automated remediation.',
          isPinned: true,
        });
      }

      if (ccr2 && sofia && cameron) {
        await db
          .update(campaignCompanyRecords)
          .set({
            prospectSummary: 'Board prep underway; requested callback next week once executive priorities finalize.',
            prospectSentiment: 'NEUTRAL',
          })
          .where(eq(campaignCompanyRecords.id, ccr2.id));

        sampleRemarks.push({
          campaignId: ccr2.campaignId,
          campaignCompanyRecordId: ccr2.id,
          companyId: ccr2.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr2.companyId)?.id ?? null,
          authorId: cameron.id,
          category: 'HANDOVER',
          content: 'Manager note: Prioritize multi-region compliance angle when calling Hannah back after board meeting.',
          isPinned: true,
        });
      }

      await db.insert(prospectRemarks).values(sampleRemarks);
    }
  }

  const dealsCountRes = await db.select({ count: sql<number>`count(*)::int` }).from(deals);
  if ((dealsCountRes[0]?.count ?? 0) === 0) {
    const allCCRs = await db.select().from(campaignCompanyRecords);
    const allContacts = await db.select().from(contacts);
    const allUsers = await db.select().from(users);
    const jordan = allUsers.find((u) => u.email === 'jordan@cadenceops.io') || allUsers.find((u) => u.role === 'SALES_REP');
    const sofia = allUsers.find((u) => u.email === 'sofia@cadenceops.io') || jordan;
    const devon = allUsers.find((u) => u.email === 'devon@cadenceops.io') || jordan;

    if (allCCRs.length > 0 && jordan) {
      const sampleDeals: Array<{
        dealCode: string;
        title: string;
        campaignId: number | null;
        campaignCompanyRecordId: number | null;
        companyId: number;
        contactId: number | null;
        ownerId: number;
        stage: string;
        amount: number;
        probability: number;
        expectedCloseDate: string;
        lossReason: string | null;
        notes: string;
        closedAt: Date | null;
      }> = [];

      const ccr0 = allCCRs[0];
      if (ccr0) {
        sampleDeals.push({
          dealCode: 'DEAL-2026-001',
          title: 'SOC 2 Posture Automation Annual License',
          campaignId: ccr0.campaignId,
          campaignCompanyRecordId: ccr0.id,
          companyId: ccr0.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr0.companyId)?.id ?? null,
          ownerId: ccr0.assignedToId || jordan.id,
          stage: 'NEGOTIATION',
          amount: 48000,
          probability: 75,
          expectedCloseDate: daysOffset(18),
          lossReason: null,
          notes: 'Security architecture sign-off completed; procurement reviewing MSA redlines.',
          closedAt: null,
        });
      }

      const ccr1 = allCCRs[1];
      if (ccr1) {
        sampleDeals.push({
          dealCode: 'DEAL-2026-002',
          title: 'Multi-Cloud Governance Enterprise Rollout',
          campaignId: ccr1.campaignId,
          campaignCompanyRecordId: ccr1.id,
          companyId: ccr1.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr1.companyId)?.id ?? null,
          ownerId: ccr1.assignedToId || jordan.id,
          stage: 'PROPOSAL',
          amount: 64000,
          probability: 50,
          expectedCloseDate: daysOffset(30),
          lossReason: null,
          notes: 'Technical demo complete; pricing tiers shared for 3 cloud regions.',
          closedAt: null,
        });
      }

      const ccr2 = allCCRs[2];
      if (ccr2 && sofia) {
        sampleDeals.push({
          dealCode: 'DEAL-2026-003',
          title: 'GPU Cluster Compliance Monitoring Pilot',
          campaignId: ccr2.campaignId,
          campaignCompanyRecordId: ccr2.id,
          companyId: ccr2.companyId,
          contactId: allContacts.find((c) => c.companyId === ccr2.companyId)?.id ?? null,
          ownerId: ccr2.assignedToId || sofia.id,
          stage: 'DISCOVERY',
          amount: 28000,
          probability: 20,
          expectedCloseDate: daysOffset(45),
          lossReason: null,
          notes: 'Initial discovery scoping underway following board priority review.',
          closedAt: null,
        });
      }

      const ccrWon = allCCRs[12] || allCCRs[3];
      if (ccrWon) {
        sampleDeals.push({
          dealCode: 'DEAL-2026-004',
          title: 'SAP S/4HANA Plant Telemetry Connector',
          campaignId: ccrWon.campaignId,
          campaignCompanyRecordId: ccrWon.id,
          companyId: ccrWon.companyId,
          contactId: allContacts.find((c) => c.companyId === ccrWon.companyId)?.id ?? null,
          ownerId: ccrWon.assignedToId || jordan.id,
          stage: 'CLOSED_WON',
          amount: 85000,
          probability: 100,
          expectedCloseDate: daysOffset(-3),
          lossReason: null,
          notes: 'Signed 12-month enterprise license following DACH manufacturing briefing.',
          closedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        });
      }

      const ccrLost = allCCRs[8] || allCCRs[4];
      if (ccrLost && devon) {
        sampleDeals.push({
          dealCode: 'DEAL-2026-005',
          title: 'Treasury Reconciliation Sandbox License',
          campaignId: ccrLost.campaignId,
          campaignCompanyRecordId: ccrLost.id,
          companyId: ccrLost.companyId,
          contactId: allContacts.find((c) => c.companyId === ccrLost.companyId)?.id ?? null,
          ownerId: ccrLost.assignedToId || devon.id,
          stage: 'CLOSED_LOST',
          amount: 22000,
          probability: 0,
          expectedCloseDate: daysOffset(-7),
          lossReason: 'Deferred to internal engineering build',
          notes: 'VP Eng prioritized in-house ledger script for Q4; revisit in H2.',
          closedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        });
      }

      if (sampleDeals.length > 0) {
        await db.insert(deals).values(sampleDeals).onConflictDoNothing();
      }
    }
  }
}

async function runSeed(): Promise<void> {
  const statusCount = await db.select({ count: sql<number>`count(*)::int` }).from(prospectStatuses);
  if ((statusCount[0]?.count ?? 0) > 0) {
    await ensureDemoAccounts();
    await ensureEnterpriseSeed();
    return;
  }

  // 1. Seed 21 configurable prospect statuses
  const statusList = [
    { code: 'NOT_YET_WORKED', label: 'Not Yet Worked', category: 'PENDING', sortOrder: 1, isTerminal: false },
    { code: 'RESEARCHING', label: 'Researching', category: 'IN_PROGRESS', sortOrder: 2, isTerminal: false },
    { code: 'ATTEMPTED_CONTACT', label: 'Attempted Contact', category: 'IN_PROGRESS', sortOrder: 3, isTerminal: false },
    { code: 'NO_ANSWER', label: 'No Answer', category: 'IN_PROGRESS', sortOrder: 4, isTerminal: false },
    { code: 'CONNECTED', label: 'Connected', category: 'IN_PROGRESS', sortOrder: 5, isTerminal: false },
    { code: 'LINKEDIN_REQUEST_SENT', label: 'LinkedIn Request Sent', category: 'IN_PROGRESS', sortOrder: 6, isTerminal: false },
    { code: 'LINKEDIN_REQUEST_ACCEPTED', label: 'LinkedIn Request Accepted', category: 'IN_PROGRESS', sortOrder: 7, isTerminal: false },
    { code: 'LINKEDIN_MESSAGE_SENT', label: 'LinkedIn Message Sent', category: 'IN_PROGRESS', sortOrder: 8, isTerminal: false },
    { code: 'EMAIL_SENT', label: 'Email Sent', category: 'IN_PROGRESS', sortOrder: 9, isTerminal: false },
    { code: 'WHATSAPP_SENT', label: 'WhatsApp Sent', category: 'IN_PROGRESS', sortOrder: 10, isTerminal: false },
    { code: 'INTERESTED', label: 'Interested', category: 'POSITIVE', sortOrder: 11, isTerminal: false },
    { code: 'FOLLOW_UP_REQUIRED', label: 'Follow-up Required', category: 'IN_PROGRESS', sortOrder: 12, isTerminal: false },
    { code: 'APPOINTMENT_BOOKED', label: 'Appointment Booked', category: 'POSITIVE', sortOrder: 13, isTerminal: false },
    { code: 'QUALIFIED_LEAD', label: 'Qualified Lead', category: 'POSITIVE', sortOrder: 14, isTerminal: false },
    { code: 'NOT_QUALIFIED', label: 'Not Qualified', category: 'CLOSED', sortOrder: 15, isTerminal: true },
    { code: 'NOT_INTERESTED', label: 'Not Interested', category: 'CLOSED', sortOrder: 16, isTerminal: true },
    { code: 'WRONG_CONTACT', label: 'Wrong Contact', category: 'CLOSED', sortOrder: 17, isTerminal: false },
    { code: 'INVALID_CONTACT', label: 'Invalid Contact', category: 'CLOSED', sortOrder: 18, isTerminal: true },
    { code: 'INVALID_DATA', label: 'Invalid Data', category: 'CLOSED', sortOrder: 19, isTerminal: true },
    { code: 'DO_NOT_CONTACT', label: 'Do Not Contact', category: 'CLOSED', sortOrder: 20, isTerminal: true },
    { code: 'COMPLETED', label: 'Completed', category: 'CLOSED', sortOrder: 21, isTerminal: true },
  ];
  await db.insert(prospectStatuses).values(statusList).onConflictDoNothing();

  // 2. Seed App Settings
  await db
    .insert(appSettings)
    .values([
      {
        key: 'outcome_rules',
        value: DEFAULT_OUTCOME_RULES,
      },
      {
        key: 'duplicate_policy',
        value: {
          strictDomainDeduplication: true,
          strictEmailDeduplication: true,
          strictLinkedinDeduplication: true,
          preventCrossRepSameCampaign: true,
          allowReuseAcrossDifferentCampaigns: true,
        },
      },
      {
        key: 'organization',
        value: {
          companyName: 'CadenceOps Revenue Operations',
          defaultTimezone: 'America/New_York',
          dailyCallTarget: 35,
          dailyOutreachTarget: 60,
        },
      },
    ])
    .onConflictDoNothing();

  // 3. Seed Employees / Users across all 4 roles (no hardcoded passwords!)
  const existingUsers = await db.select().from(users);
  if (existingUsers.length > 0) return;

  const insertedUsers = await db
    .insert(users)
    .values([
      {
        employeeCode: 'EMP-1001',
        username: 'elena.vance',
        email: 'elena@cadenceops.io',
        fullName: 'Elena Vance',
        phone: '+1-415-890-2101',
        department: 'Executive',
        jobRole: 'VP of Revenue Operations',
        role: 'SUPER_ADMIN',
        joiningDate: '2024-03-15',
        isActive: true,
      },
      {
        employeeCode: 'EMP-1002',
        username: 'marcus.sterling',
        email: 'marcus@cadenceops.io',
        fullName: 'Marcus Sterling',
        phone: '+1-415-890-2102',
        department: 'Data Operations',
        jobRole: 'Lead Data Manager',
        role: 'DATA_MANAGER',
        joiningDate: '2024-06-01',
        isActive: true,
      },
      {
        employeeCode: 'EMP-1003',
        username: 'priya.nair',
        email: 'priya@cadenceops.io',
        fullName: 'Priya Nair',
        phone: '+1-415-890-2103',
        department: 'People & HR',
        jobRole: 'HR Operations Manager',
        role: 'HR_MANAGER',
        joiningDate: '2024-07-10',
        isActive: true,
      },
      {
        employeeCode: 'EMP-1004',
        username: 'jordan.blake',
        email: 'jordan@cadenceops.io',
        fullName: 'Jordan Blake',
        phone: '+1-415-890-2104',
        department: 'Sales',
        jobRole: 'Senior Prospecting Executive',
        role: 'SALES_REP',
        joiningDate: '2025-01-12',
        isActive: true,
      },
      {
        employeeCode: 'EMP-1005',
        username: 'sofia.alvarez',
        email: 'sofia@cadenceops.io',
        fullName: 'Sofia Alvarez',
        phone: '+1-415-890-2105',
        department: 'Sales',
        jobRole: 'Sales Representative',
        role: 'SALES_REP',
        joiningDate: '2025-03-04',
        isActive: true,
      },
      {
        employeeCode: 'EMP-1006',
        username: 'devon.brooks',
        email: 'devon@cadenceops.io',
        fullName: 'Devon Brooks',
        phone: '+1-415-890-2106',
        department: 'Sales',
        jobRole: 'Outbound SDR',
        role: 'SALES_REP',
        joiningDate: '2025-05-19',
        isActive: true,
      },
    ])
    .returning();

  const admin = insertedUsers[0]!;
  const dataMgr = insertedUsers[1]!;
  const hrMgr = insertedUsers[2]!;
  const repJordan = insertedUsers[3]!;
  const repSofia = insertedUsers[4]!;
  const repDevon = insertedUsers[5]!;

  // 4. Seed Campaigns
  const insertedCampaigns = await db
    .insert(campaigns)
    .values([
      {
        campaignCode: 'CMP-2026-001',
        name: 'US IT Decision Makers',
        description: 'Outbound multi-channel campaign targeting mid-market and enterprise CTOs, CIOs, and VPs of Infrastructure across the United States.',
        clientName: 'NexaCloud Security',
        objective: 'Book 45 qualified discovery calls per month with IT leadership evaluating cloud posture automation.',
        targetIndustry: 'Cloud Software, SaaS, Financial Services',
        targetCountries: 'United States',
        targetJobTitles: 'CTO, CIO, VP Engineering, Head of Cloud Infrastructure',
        targetCompanySize: '200-2,500 employees',
        startDate: daysOffset(-25),
        endDate: daysOffset(35),
        campaignManagerId: admin.id,
        dataManagerId: dataMgr.id,
        status: 'ACTIVE',
        targetCompaniesCount: 150,
        notes: 'High-priority Q4 enterprise pipeline build. Prioritize companies running multi-cloud AWS/GCP stacks.',
        instructions:
          '1. Verify LinkedIn activity before cold calling.\n2. Lead with compliance audit velocity pain point.\n3. If prospect requests info, send Case Study Deck via email within 2 hours and schedule a 48h follow-up.',
        qualificationCriteria: 'Minimum 150 employees, active cloud workload in AWS/Azure/GCP, evaluating security automation within 6 months.',
        qualificationQuestions: [
          'How are you currently tracking cloud configuration drift across production accounts?',
          'Who owns SOC 2 / ISO 27001 readiness within your infrastructure team?',
          'Are you evaluating automation tooling before the next audit cycle?',
        ],
        allowDuplicateAssignments: false,
        createdById: dataMgr.id,
      },
      {
        campaignCode: 'CMP-2026-002',
        name: 'UK FinTech Revenue Leaders',
        description: 'Targeted executive outreach to Heads of Revenue, CROs, and VPs of Growth in FCA-regulated UK fintech scale-ups.',
        clientName: 'PayLedger Analytics',
        objective: 'Generate 25 enterprise demo appointments for embedded treasury intelligence.',
        targetIndustry: 'FinTech, Payments, Banking Technology',
        targetCountries: 'United Kingdom',
        targetJobTitles: 'CRO, VP Revenue, Head of Partnerships, CFO',
        targetCompanySize: '50-500 employees',
        startDate: daysOffset(-18),
        endDate: daysOffset(42),
        campaignManagerId: admin.id,
        dataManagerId: dataMgr.id,
        status: 'ACTIVE',
        targetCompaniesCount: 90,
        notes: 'Focus on London and Manchester fintech clusters. Timezone GMT/BST.',
        instructions:
          '1. Call between 9:00 AM and 11:30 AM GMT.\n2. Reference FCA operational resilience mandate.\n3. Log exact prospect objection category on every connected call.',
        qualificationCriteria: 'Series A+ FinTech operating in UK with >£5M ARR or B2B payment volume.',
        qualificationQuestions: [
          'What payment reconciliation bottlenecks does your finance ops team face today?',
          'Are you planning cross-border GBP/EUR liquidity expansion in 2027?',
        ],
        allowDuplicateAssignments: false,
        createdById: admin.id,
      },
      {
        campaignCode: 'CMP-2026-003',
        name: 'DACH Enterprise Manufacturing Ops',
        description: 'Supply chain digitization outreach across Germany, Austria, and Switzerland industrial manufacturers.',
        clientName: 'Kinetix ERP Systems',
        objective: 'Identify plant digitization leads and book technical scoping briefings.',
        targetIndustry: 'Industrial Automation, Manufacturing, Logistics',
        targetCountries: 'Germany, Switzerland, Austria',
        targetJobTitles: 'COO, VP Operations, Director of Supply Chain',
        targetCompanySize: '500-5,000 employees',
        startDate: daysOffset(-40),
        endDate: daysOffset(-2),
        campaignManagerId: admin.id,
        dataManagerId: dataMgr.id,
        status: 'COMPLETED',
        targetCompaniesCount: 60,
        notes: 'Phase 1 closed with strong conversion in Munich and Stuttgart.',
        instructions: 'Ensure English or German outreach preference is noted before booking.',
        qualificationCriteria: 'Multi-site manufacturing footprint with legacy ERP modernization roadmap.',
        qualificationQuestions: ['How many manufacturing sites share unified inventory telemetry?'],
        allowDuplicateAssignments: false,
        createdById: dataMgr.id,
      },
      {
        campaignCode: 'CMP-2026-004',
        name: 'North America Healthcare IT CISOs',
        description: 'Upcoming compliance and zero-trust outreach for regional health systems and digital health platforms.',
        clientName: 'MedShield Cyber',
        objective: 'Build qualified CISO pipeline for Q1 kickoff.',
        targetIndustry: 'Healthcare IT, Digital Health, Hospital Systems',
        targetCountries: 'United States, Canada',
        targetJobTitles: 'CISO, VP Information Security, Director IT Compliance',
        targetCompanySize: '250-10,000 employees',
        startDate: daysOffset(5),
        endDate: daysOffset(65),
        campaignManagerId: admin.id,
        dataManagerId: dataMgr.id,
        status: 'READY',
        targetCompaniesCount: 120,
        notes: 'Awaiting final batch enrichment from Data Operations.',
        instructions: 'Use HIPAA Zero-Trust whitepaper offer on first email touchpoint.',
        qualificationCriteria: 'HIPAA-covered entity handling EHR integrations.',
        qualificationQuestions: ['When is your next HIPAA security risk assessment scheduled?'],
        allowDuplicateAssignments: false,
        createdById: dataMgr.id,
      },
    ])
    .returning();

  const cmpUS = insertedCampaigns[0]!;
  const cmpUK = insertedCampaigns[1]!;
  const cmpDACH = insertedCampaigns[2]!;
  const cmpHealth = insertedCampaigns[3]!;

  // 5. Campaign Members
  await db
    .insert(campaignMembers)
    .values([
      { campaignId: cmpUS.id, userId: repJordan.id, memberRole: 'SALES_REP', allocatedQuota: 40 },
      { campaignId: cmpUS.id, userId: repSofia.id, memberRole: 'SALES_REP', allocatedQuota: 40 },
      { campaignId: cmpUS.id, userId: repDevon.id, memberRole: 'SALES_REP', allocatedQuota: 30 },
      { campaignId: cmpUK.id, userId: repSofia.id, memberRole: 'SALES_REP', allocatedQuota: 30 },
      { campaignId: cmpUK.id, userId: repDevon.id, memberRole: 'SALES_REP', allocatedQuota: 30 },
      { campaignId: cmpDACH.id, userId: repJordan.id, memberRole: 'SALES_REP', allocatedQuota: 25 },
      { campaignId: cmpHealth.id, userId: repJordan.id, memberRole: 'SALES_REP', allocatedQuota: 35 },
    ])
    .onConflictDoNothing();

  // 6. Centralized Companies
  const companySeeds = [
    {
      name: 'Vanguard Cloud Systems',
      website: 'https://vanguardcloud.io',
      domain: 'vanguardcloud.io',
      linkedinUrl: 'https://linkedin.com/company/vanguard-cloud-systems',
      industry: 'Cloud Software',
      employeeSize: '420',
      country: 'United States',
      state: 'California',
      city: 'San Francisco',
      revenue: '$48M',
      description: 'Multi-cloud observability and Kubernetes deployment automation platform.',
      aiScore: 92,
      fitScore: 94,
      dataSource: 'Apollo',
    },
    {
      name: 'Meridian DataWorks',
      website: 'https://meridiandata.com',
      domain: 'meridiandata.com',
      linkedinUrl: 'https://linkedin.com/company/meridian-dataworks',
      industry: 'Enterprise SaaS',
      employeeSize: '780',
      country: 'United States',
      state: 'New York',
      city: 'New York',
      revenue: '$92M',
      description: 'Real-time data governance and warehouse lineage tooling for financial teams.',
      aiScore: 89,
      fitScore: 91,
      dataSource: 'Apollo',
    },
    {
      name: 'Stratos Compute Inc',
      website: 'https://stratoscompute.ai',
      domain: 'stratoscompute.ai',
      linkedinUrl: 'https://linkedin.com/company/stratos-compute',
      industry: 'Cloud Infrastructure',
      employeeSize: '310',
      country: 'United States',
      state: 'Texas',
      city: 'Austin',
      revenue: '$34M',
      description: 'Distributed GPU cluster orchestration for enterprise AI workloads.',
      aiScore: 87,
      fitScore: 88,
      dataSource: 'Apollo',
    },
    {
      name: 'HarborPoint Logistics Tech',
      website: 'https://harborpointtech.com',
      domain: 'harborpointtech.com',
      linkedinUrl: 'https://linkedin.com/company/harborpoint-tech',
      industry: 'Supply Chain SaaS',
      employeeSize: '540',
      country: 'United States',
      state: 'Illinois',
      city: 'Chicago',
      revenue: '$61M',
      description: 'Automated freight visibility and customs compliance platform.',
      aiScore: 83,
      fitScore: 85,
      dataSource: 'CSV',
    },
    {
      name: 'Crestline CyberDefense',
      website: 'https://crestlinecyber.com',
      domain: 'crestlinecyber.com',
      linkedinUrl: 'https://linkedin.com/company/crestline-cyber',
      industry: 'Cybersecurity',
      employeeSize: '260',
      country: 'United States',
      state: 'Massachusetts',
      city: 'Boston',
      revenue: '$29M',
      description: 'Identity threat detection and PAM automation for hybrid enterprises.',
      aiScore: 90,
      fitScore: 86,
      dataSource: 'Apollo',
    },
    {
      name: 'BluePeak Health Analytics',
      website: 'https://bluepeakhealth.org',
      domain: 'bluepeakhealth.org',
      linkedinUrl: 'https://linkedin.com/company/bluepeak-health',
      industry: 'Healthcare IT',
      employeeSize: '650',
      country: 'United States',
      state: 'Colorado',
      city: 'Denver',
      revenue: '$74M',
      description: 'Interoperable EHR revenue cycle intelligence for hospital networks.',
      aiScore: 85,
      fitScore: 82,
      dataSource: 'Excel',
    },
    {
      name: 'Northstar Payments Group',
      website: 'https://northstarpay.com',
      domain: 'northstarpay.com',
      linkedinUrl: 'https://linkedin.com/company/northstar-payments',
      industry: 'FinTech',
      employeeSize: '480',
      country: 'United States',
      state: 'Georgia',
      city: 'Atlanta',
      revenue: '$55M',
      description: 'B2B ACH settlement and treasury risk engine.',
      aiScore: 88,
      fitScore: 89,
      dataSource: 'Apollo',
    },
    {
      name: 'Thames Ledger Technologies',
      website: 'https://thamesledger.co.uk',
      domain: 'thamesledger.co.uk',
      linkedinUrl: 'https://linkedin.com/company/thames-ledger',
      industry: 'FinTech',
      employeeSize: '195',
      country: 'United Kingdom',
      state: 'London',
      city: 'London',
      revenue: '$22M',
      description: 'Cross-border B2B FX settlement and treasury APIs for UK scale-ups.',
      aiScore: 91,
      fitScore: 93,
      dataSource: 'Apollo',
    },
    {
      name: 'Albion OpenBanking Ltd',
      website: 'https://albionopenbanking.co.uk',
      domain: 'albionopenbanking.co.uk',
      linkedinUrl: 'https://linkedin.com/company/albion-openbanking',
      industry: 'Payments',
      employeeSize: '140',
      country: 'United Kingdom',
      state: 'Greater Manchester',
      city: 'Manchester',
      revenue: '$16M',
      description: 'FCA-licensed account-to-account checkout infrastructure.',
      aiScore: 86,
      fitScore: 88,
      dataSource: 'Apollo',
    },
    {
      name: 'SterlingVault Treasury',
      website: 'https://sterlingvault.uk',
      domain: 'sterlingvault.uk',
      linkedinUrl: 'https://linkedin.com/company/sterlingvault',
      industry: 'FinTech',
      employeeSize: '320',
      country: 'United Kingdom',
      state: 'London',
      city: 'London',
      revenue: '$39M',
      description: 'Automated cashflow forecasting and corporate card controls.',
      aiScore: 84,
      fitScore: 87,
      dataSource: 'CSV',
    },
    {
      name: 'Caledonia Risk Systems',
      website: 'https://caledoniarisk.co.uk',
      domain: 'caledoniarisk.co.uk',
      linkedinUrl: 'https://linkedin.com/company/caledonia-risk',
      industry: 'RegTech',
      employeeSize: '115',
      country: 'United Kingdom',
      state: 'Scotland',
      city: 'Edinburgh',
      revenue: '$14M',
      description: 'Automated AML/KYC transaction screening for European banks.',
      aiScore: 80,
      fitScore: 81,
      dataSource: 'Apollo',
    },
    {
      name: 'Bavaria Precision Robotics',
      website: 'https://bavariarobotics.de',
      domain: 'bavariarobotics.de',
      linkedinUrl: 'https://linkedin.com/company/bavaria-robotics',
      industry: 'Industrial Automation',
      employeeSize: '1,250',
      country: 'Germany',
      state: 'Bavaria',
      city: 'Munich',
      revenue: '$185M',
      description: 'Autonomous warehouse robotics and MES integration for automotive OEMs.',
      aiScore: 93,
      fitScore: 90,
      dataSource: 'Excel',
    },
    {
      name: 'Helvetia MedTech AG',
      website: 'https://helvetiamed.ch',
      domain: 'helvetiamed.ch',
      linkedinUrl: 'https://linkedin.com/company/helvetia-medtech',
      industry: 'Manufacturing',
      employeeSize: '890',
      country: 'Switzerland',
      state: 'Zurich',
      city: 'Zurich',
      revenue: '$140M',
      description: 'Precision surgical device manufacturing with ISO-13485 traceability.',
      aiScore: 88,
      fitScore: 85,
      dataSource: 'Excel',
    },
    {
      name: 'Cascade Grid Energy',
      website: 'https://cascadegrid.com',
      domain: 'cascadegrid.com',
      linkedinUrl: 'https://linkedin.com/company/cascade-grid',
      industry: 'CleanTech Software',
      employeeSize: '230',
      country: 'United States',
      state: 'Washington',
      city: 'Seattle',
      revenue: '$26M',
      description: 'Smart microgrid telemetry and utility demand forecasting.',
      aiScore: 79,
      fitScore: 80,
      dataSource: 'Apollo',
    },
    {
      name: 'Redwood BioHealth',
      website: 'https://redwoodbiohealth.com',
      domain: 'redwoodbiohealth.com',
      linkedinUrl: 'https://linkedin.com/company/redwood-biohealth',
      industry: 'Healthcare IT',
      employeeSize: '510',
      country: 'United States',
      state: 'California',
      city: 'San Diego',
      revenue: '$62M',
      description: 'Clinical trial patient data security and HIPAA vault infrastructure.',
      aiScore: 86,
      fitScore: 89,
      dataSource: 'Apollo',
    },
  ];

  const insertedCompanies = await db
    .insert(companies)
    .values(
      companySeeds.map((c) => ({
        ...c,
        normalizedName: normalizeCompanyName(c.name),
        normalizedDomain: normalizeDomain(c.domain)!,
        normalizedLinkedin: normalizeLinkedin(c.linkedinUrl),
        validationStatus: 'VALID',
        createdById: dataMgr.id,
      }))
    )
    .returning();

  // 7. Centralized Contacts
  const contactSeeds = [
    { companyIdx: 0, firstName: 'Claire', lastName: 'Donovan', jobTitle: 'Chief Technology Officer', department: 'Engineering', seniority: 'C-Level', workEmail: 'claire.donovan@vanguardcloud.io', phone: '+1-415-555-0141', linkedinUrl: 'https://linkedin.com/in/claire-donovan-cto', aiScore: 95, fitScore: 96 },
    { companyIdx: 0, firstName: 'Nathan', lastName: 'Kerr', jobTitle: 'VP of Cloud Infrastructure', department: 'IT & Cloud', seniority: 'VP', workEmail: 'nathan.kerr@vanguardcloud.io', phone: '+1-415-555-0142', linkedinUrl: 'https://linkedin.com/in/nathan-kerr-infra', aiScore: 88, fitScore: 90 },
    { companyIdx: 1, firstName: 'Victor', lastName: 'Chen', jobTitle: 'Chief Information Officer', department: 'IT', seniority: 'C-Level', workEmail: 'v.chen@meridiandata.com', phone: '+1-212-555-0188', linkedinUrl: 'https://linkedin.com/in/victor-chen-cio', aiScore: 91, fitScore: 92 },
    { companyIdx: 2, firstName: 'Hannah', lastName: 'Albright', jobTitle: 'VP Engineering', department: 'Engineering', seniority: 'VP', workEmail: 'hannah@stratoscompute.ai', phone: '+1-512-555-0123', linkedinUrl: 'https://linkedin.com/in/hannah-albright', aiScore: 89, fitScore: 87 },
    { companyIdx: 3, firstName: 'Derek', lastName: 'Okafor', jobTitle: 'Head of Platform Engineering', department: 'Engineering', seniority: 'Director', workEmail: 'derek.okafor@harborpointtech.com', phone: '+1-312-555-0174', linkedinUrl: 'https://linkedin.com/in/derek-okafor', aiScore: 84, fitScore: 86 },
    { companyIdx: 4, firstName: 'Rachel', lastName: 'Whitman', jobTitle: 'Chief Technology Officer', department: 'Engineering', seniority: 'C-Level', workEmail: 'rachel@crestlinecyber.com', phone: '+1-617-555-0192', linkedinUrl: 'https://linkedin.com/in/rachel-whitman-cto', aiScore: 92, fitScore: 91 },
    { companyIdx: 5, firstName: 'Samuel', lastName: 'Pate', jobTitle: 'VP of IT Operations', department: 'IT', seniority: 'VP', workEmail: 'spate@bluepeakhealth.org', phone: '+1-303-555-0165', linkedinUrl: 'https://linkedin.com/in/samuel-pate', aiScore: 86, fitScore: 85 },
    { companyIdx: 6, firstName: 'Monica', lastName: 'Geller-Reyes', jobTitle: 'SVP Technology & Risk', department: 'Engineering', seniority: 'VP', workEmail: 'monica.reyes@northstarpay.com', phone: '+1-404-555-0119', linkedinUrl: 'https://linkedin.com/in/monica-reyes-fintech', aiScore: 90, fitScore: 91 },
    { companyIdx: 7, firstName: 'Oliver', lastName: 'Ashworth', jobTitle: 'Chief Revenue Officer', department: 'Revenue', seniority: 'C-Level', workEmail: 'oliver@thamesledger.co.uk', phone: '+44-20-7946-0821', linkedinUrl: 'https://linkedin.com/in/oliver-ashworth-cro', aiScore: 94, fitScore: 95 },
    { companyIdx: 8, firstName: 'Freya', lastName: 'Mackenzie', jobTitle: 'VP of Growth & Partnerships', department: 'Revenue', seniority: 'VP', workEmail: 'freya@albionopenbanking.co.uk', phone: '+44-161-496-0312', linkedinUrl: 'https://linkedin.com/in/freya-mackenzie', aiScore: 87, fitScore: 89 },
    { companyIdx: 9, firstName: 'Liam', lastName: 'Gallagher-Houghton', jobTitle: 'Head of Revenue Operations', department: 'Revenue', seniority: 'Director', workEmail: 'liam.h@sterlingvault.uk', phone: '+44-20-7946-0944', linkedinUrl: 'https://linkedin.com/in/liam-houghton-revops', aiScore: 85, fitScore: 86 },
    { companyIdx: 10, firstName: 'Callum', lastName: 'Reid', jobTitle: 'Chief Financial Officer', department: 'Finance', seniority: 'C-Level', workEmail: 'callum.reid@caledoniarisk.co.uk', phone: '+44-131-496-0421', linkedinUrl: 'https://linkedin.com/in/callum-reid-cfo', aiScore: 82, fitScore: 83 },
    { companyIdx: 11, firstName: 'Lukas', lastName: 'Weber', jobTitle: 'VP Global Manufacturing Ops', department: 'Operations', seniority: 'VP', workEmail: 'l.weber@bavariarobotics.de', phone: '+49-89-555-0182', linkedinUrl: 'https://linkedin.com/in/lukas-weber-ops', aiScore: 91, fitScore: 90 },
    { companyIdx: 12, firstName: 'Sabine', lastName: 'Keller', jobTitle: 'Director of Supply Chain', department: 'Operations', seniority: 'Director', workEmail: 's.keller@helvetiamed.ch', phone: '+41-44-555-0133', linkedinUrl: 'https://linkedin.com/in/sabine-keller', aiScore: 87, fitScore: 86 },
    { companyIdx: 13, firstName: 'Trevor', lastName: 'Hayes', jobTitle: 'VP Infrastructure', department: 'IT', seniority: 'VP', workEmail: 'trevor.hayes@cascadegrid.com', phone: '+1-206-555-0155', linkedinUrl: 'https://linkedin.com/in/trevor-hayes-grid', aiScore: 80, fitScore: 82 },
    { companyIdx: 14, firstName: 'Dr. Nina', lastName: 'Patel', jobTitle: 'Chief Information Security Officer', department: 'Security', seniority: 'C-Level', workEmail: 'nina.patel@redwoodbiohealth.com', phone: '+1-858-555-0148', linkedinUrl: 'https://linkedin.com/in/nina-patel-ciso', aiScore: 93, fitScore: 94 },
  ];

  const insertedContacts = await db
    .insert(contacts)
    .values(
      contactSeeds.map((ct) => {
        const comp = insertedCompanies[ct.companyIdx]!;
        return {
          companyId: comp.id,
          firstName: ct.firstName,
          lastName: ct.lastName,
          fullName: `${ct.firstName} ${ct.lastName}`,
          jobTitle: ct.jobTitle,
          department: ct.department,
          seniority: ct.seniority,
          workEmail: ct.workEmail,
          normalizedEmail: normalizeEmail(ct.workEmail),
          phone: ct.phone,
          normalizedPhone: normalizePhone(ct.phone),
          linkedinUrl: ct.linkedinUrl,
          normalizedLinkedin: normalizeLinkedin(ct.linkedinUrl),
          country: comp.country,
          dataSource: comp.dataSource,
          aiScore: ct.aiScore,
          fitScore: ct.fitScore,
          validationStatus: 'VALID',
          createdById: dataMgr.id,
        };
      })
    )
    .returning();

  // 8. Import Batches
  const insertedBatches = await db
    .insert(importBatches)
    .values([
      {
        batchCode: 'IMP-2026-001',
        fileName: 'apollo_us_it_decision_makers_q4.csv',
        dataSource: 'Apollo',
        campaignId: cmpUS.id,
        importedById: dataMgr.id,
        totalRows: 10,
        importedCompanies: 7,
        importedContacts: 8,
        duplicatesDetected: 2,
        invalidRows: 0,
        missingInfoRows: 1,
        columnMapping: {
          'Company': 'companyName',
          'Website': 'website',
          'Industry': 'industry',
          'Employees': 'employeeSize',
          'Email': 'workEmail',
          'Title': 'jobTitle',
        },
        status: 'COMPLETED',
      },
      {
        batchCode: 'IMP-2026-002',
        fileName: 'uk_fintech_revenue_leaders.xlsx',
        dataSource: 'Excel',
        campaignId: cmpUK.id,
        importedById: dataMgr.id,
        totalRows: 5,
        importedCompanies: 4,
        importedContacts: 4,
        duplicatesDetected: 1,
        invalidRows: 0,
        missingInfoRows: 0,
        columnMapping: {
          'Company Name': 'companyName',
          'Domain': 'domain',
          'Full Name': 'fullName',
          'Work Email': 'workEmail',
        },
        status: 'COMPLETED',
      },
    ])
    .returning();

  const batchUS = insertedBatches[0]!;
  const batchUK = insertedBatches[1]!;

  // Record a few import record rows
  await db.insert(importRecords).values(
    insertedCompanies.slice(0, 7).map((c, idx) => ({
      batchId: batchUS.id,
      rowNumber: idx + 1,
      companyId: c.id,
      contactId: insertedContacts[idx]?.id ?? null,
      outcome: 'CREATED',
      details: 'Imported and validated cleanly',
    }))
  );

  // 9. Campaign Company Records + Assignments
  const ccrSeeds = [
    // US IT Decision Makers (7 assigned + 1 unassigned)
    { campaignId: cmpUS.id, companyIdx: 0, batchId: batchUS.id, status: 'APPOINTMENT_BOOKED', assignedTo: repJordan.id, lastOutcome: 'APPOINTMENT_BOOKED', workedCount: 4, dueDate: daysOffset(5) },
    { campaignId: cmpUS.id, companyIdx: 1, batchId: batchUS.id, status: 'INTERESTED', assignedTo: repJordan.id, lastOutcome: 'PROSPECT_INTERESTED', workedCount: 3, dueDate: daysOffset(3) },
    { campaignId: cmpUS.id, companyIdx: 2, batchId: batchUS.id, status: 'FOLLOW_UP_REQUIRED', assignedTo: repJordan.id, lastOutcome: 'FOLLOW_UP_REQUESTED', workedCount: 2, dueDate: daysOffset(2) },
    { campaignId: cmpUS.id, companyIdx: 3, batchId: batchUS.id, status: 'NOT_YET_WORKED', assignedTo: repSofia.id, lastOutcome: null, workedCount: 0, dueDate: daysOffset(7) },
    { campaignId: cmpUS.id, companyIdx: 4, batchId: batchUS.id, status: 'LINKEDIN_MESSAGE_SENT', assignedTo: repSofia.id, lastOutcome: 'LINKEDIN_MESSAGE_SENT', workedCount: 2, dueDate: daysOffset(4) },
    { campaignId: cmpUS.id, companyIdx: 5, batchId: batchUS.id, status: 'QUALIFIED_LEAD', assignedTo: repDevon.id, lastOutcome: 'QUALIFIED_LEAD', workedCount: 3, dueDate: daysOffset(6) },
    { campaignId: cmpUS.id, companyIdx: 6, batchId: batchUS.id, status: 'NO_ANSWER', assignedTo: repDevon.id, lastOutcome: 'ATTEMPTED_NO_ANSWER', workedCount: 1, dueDate: daysOffset(4) },
    { campaignId: cmpUS.id, companyIdx: 13, batchId: batchUS.id, status: 'NOT_YET_WORKED', assignedTo: null, lastOutcome: null, workedCount: 0, dueDate: null },
    // UK FinTech
    { campaignId: cmpUK.id, companyIdx: 7, batchId: batchUK.id, status: 'APPOINTMENT_BOOKED', assignedTo: repSofia.id, lastOutcome: 'APPOINTMENT_BOOKED', workedCount: 3, dueDate: daysOffset(4) },
    { campaignId: cmpUK.id, companyIdx: 8, batchId: batchUK.id, status: 'EMAIL_SENT', assignedTo: repSofia.id, lastOutcome: 'EMAIL_SENT', workedCount: 1, dueDate: daysOffset(5) },
    { campaignId: cmpUK.id, companyIdx: 9, batchId: batchUK.id, status: 'NOT_YET_WORKED', assignedTo: repDevon.id, lastOutcome: null, workedCount: 0, dueDate: daysOffset(6) },
    { campaignId: cmpUK.id, companyIdx: 10, batchId: batchUK.id, status: 'NOT_YET_WORKED', assignedTo: null, lastOutcome: null, workedCount: 0, dueDate: null },
    // DACH Completed
    { campaignId: cmpDACH.id, companyIdx: 11, batchId: null, status: 'COMPLETED', assignedTo: repJordan.id, lastOutcome: 'APPOINTMENT_BOOKED', workedCount: 4, dueDate: daysOffset(-5) },
    { campaignId: cmpDACH.id, companyIdx: 12, batchId: null, status: 'NOT_INTERESTED', assignedTo: repJordan.id, lastOutcome: 'NOT_INTERESTED', workedCount: 2, dueDate: daysOffset(-8) },
    // Healthcare Ready (unassigned pool)
    { campaignId: cmpHealth.id, companyIdx: 14, batchId: null, status: 'NOT_YET_WORKED', assignedTo: null, lastOutcome: null, workedCount: 0, dueDate: null },
  ];

  const insertedCCRs = await db
    .insert(campaignCompanyRecords)
    .values(
      ccrSeeds.map((s) => ({
        campaignId: s.campaignId,
        companyId: insertedCompanies[s.companyIdx]!.id,
        importBatchId: s.batchId,
        isApproved: true,
        status: s.status,
        assignedToId: s.assignedTo,
        assignedById: s.assignedTo ? dataMgr.id : null,
        assignedAt: s.assignedTo ? new Date(Date.now() - 1000 * 60 * 60 * 24 * 6) : null,
        dueDate: s.dueDate,
        assignmentInstructions: s.assignedTo ? 'Follow campaign qualification checklist and log all multi-channel touches.' : null,
        lastActivityAt: s.workedCount > 0 ? new Date(Date.now() - 1000 * 60 * 60 * 14) : null,
        lastOutcome: s.lastOutcome,
        workedCount: s.workedCount,
      }))
    )
    .returning();

  // Campaign Contact Records
  for (let i = 0; i < insertedCCRs.length; i++) {
    const ccr = insertedCCRs[i]!;
    const compContacts = insertedContacts.filter((ct) => ct.companyId === ccr.companyId);
    for (const ct of compContacts) {
      await db
        .insert(campaignContactRecords)
        .values({
          campaignId: ccr.campaignId,
          campaignCompanyRecordId: ccr.id,
          companyId: ccr.companyId,
          contactId: ct.id,
          status: ccr.status,
          assignedToId: ccr.assignedToId,
          lastActivityAt: ccr.lastActivityAt,
          lastOutcome: ccr.lastOutcome,
        })
        .onConflictDoNothing();
    }
  }

  // Assignments & History
  for (const ccr of insertedCCRs) {
    if (ccr.assignedToId) {
      await db.insert(assignments).values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        assignedToId: ccr.assignedToId,
        assignedById: dataMgr.id,
        distributionDate: daysOffset(-6),
        deadline: ccr.dueDate,
        instructions: ccr.assignmentInstructions,
        status: ccr.status === 'COMPLETED' ? 'COMPLETED' : 'ACTIVE',
      });
      await db.insert(assignmentHistory).values({
        campaignId: ccr.campaignId,
        campaignCompanyRecordId: ccr.id,
        previousAssigneeId: null,
        newAssigneeId: ccr.assignedToId,
        changedById: dataMgr.id,
        action: 'ASSIGNED',
        reason: 'Initial campaign data distribution',
      });
    }
  }

  // 10. Outreach Activities Timeline (Realistic multi-channel sequence!)
  const vanguardCCR = insertedCCRs[0]!;
  const meridianCCR = insertedCCRs[1]!;
  const stratosCCR = insertedCCRs[2]!;
  const crestlineCCR = insertedCCRs[4]!;
  const bluepeakCCR = insertedCCRs[5]!;
  const northstarCCR = insertedCCRs[6]!;
  const thamesCCR = insertedCCRs[8]!;
  const albionCCR = insertedCCRs[9]!;

  await db.insert(activities).values([
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: vanguardCCR.id,
      companyId: vanguardCCR.companyId,
      contactId: insertedContacts[0]!.id,
      createdById: repJordan.id,
      activityDate: daysOffset(-6),
      activityTime: '09:40',
      channel: 'PHONE_CALL',
      activityType: 'Cold Call',
      outcome: 'ATTEMPTED_NO_ANSWER',
      responseCategory: 'NO_RESPONSE',
      notes: 'Reached voicemail, left concise note referencing AWS posture benchmark.',
      resultingStatus: 'NO_ANSWER',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: vanguardCCR.id,
      companyId: vanguardCCR.companyId,
      contactId: insertedContacts[0]!.id,
      createdById: repJordan.id,
      activityDate: daysOffset(-5),
      activityTime: '11:15',
      channel: 'LINKEDIN_CONNECTION',
      activityType: 'Connection Request',
      outcome: 'LINKEDIN_REQUEST_SENT',
      responseCategory: 'NO_RESPONSE',
      notes: 'Sent personalized connection request mentioning SOC 2 automation.',
      resultingStatus: 'LINKEDIN_REQUEST_SENT',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: vanguardCCR.id,
      companyId: vanguardCCR.companyId,
      contactId: insertedContacts[0]!.id,
      createdById: repJordan.id,
      activityDate: daysOffset(-3),
      activityTime: '14:20',
      channel: 'EMAIL',
      activityType: 'Follow-up Email',
      outcome: 'EMAIL_SENT',
      responseCategory: 'SEND_EMAIL',
      notes: 'Claire accepted LinkedIn request and asked for architecture overview by email.',
      resultingStatus: 'EMAIL_SENT',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: vanguardCCR.id,
      companyId: vanguardCCR.companyId,
      contactId: insertedContacts[0]!.id,
      createdById: repJordan.id,
      activityDate: daysOffset(-1),
      activityTime: '15:05',
      channel: 'PHONE_CALL',
      activityType: 'Discovery Call',
      outcome: 'APPOINTMENT_BOOKED',
      responseCategory: 'MEETING_AGREED',
      notes: 'Confirmed 30-min technical walkthrough with Claire & VP Infrastructure.',
      resultingStatus: 'APPOINTMENT_BOOKED',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: meridianCCR.id,
      companyId: meridianCCR.companyId,
      contactId: insertedContacts[2]!.id,
      createdById: repJordan.id,
      activityDate: daysOffset(-2),
      activityTime: '10:30',
      channel: 'PHONE_CALL',
      activityType: 'Cold Call',
      outcome: 'PROSPECT_INTERESTED',
      responseCategory: 'INTERESTED',
      notes: 'Victor confirmed they are reviewing drift tooling in Q1 and wants a case study.',
      followUpDate: daysOffset(0),
      resultingStatus: 'INTERESTED',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: stratosCCR.id,
      companyId: stratosCCR.companyId,
      contactId: insertedContacts[3]!.id,
      createdById: repJordan.id,
      activityDate: daysOffset(-3),
      activityTime: '16:10',
      channel: 'WHATSAPP',
      activityType: 'WhatsApp Follow-up',
      outcome: 'FOLLOW_UP_REQUESTED',
      responseCategory: 'CALL_LATER',
      notes: 'Hannah requested a call back later this week after board prep.',
      followUpDate: daysOffset(-1),
      resultingStatus: 'FOLLOW_UP_REQUIRED',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: crestlineCCR.id,
      companyId: crestlineCCR.companyId,
      contactId: insertedContacts[5]!.id,
      createdById: repSofia.id,
      activityDate: daysOffset(-2),
      activityTime: '13:05',
      channel: 'LINKEDIN_MESSAGE',
      activityType: 'LinkedIn InMail',
      outcome: 'LINKEDIN_MESSAGE_SENT',
      responseCategory: 'NO_RESPONSE',
      notes: 'Sent benchmark report link via LinkedIn message.',
      resultingStatus: 'LINKEDIN_MESSAGE_SENT',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: bluepeakCCR.id,
      companyId: bluepeakCCR.companyId,
      contactId: insertedContacts[6]!.id,
      createdById: repDevon.id,
      activityDate: daysOffset(-1),
      activityTime: '11:45',
      channel: 'PHONE_CALL',
      activityType: 'Qualification Call',
      outcome: 'QUALIFIED_LEAD',
      responseCategory: 'INTERESTED',
      notes: 'All 3 qualification questions passed; budget owner identified.',
      followUpDate: daysOffset(1),
      resultingStatus: 'QUALIFIED_LEAD',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: northstarCCR.id,
      companyId: northstarCCR.companyId,
      contactId: insertedContacts[7]!.id,
      createdById: repDevon.id,
      activityDate: daysOffset(-1),
      activityTime: '09:15',
      channel: 'PHONE_CALL',
      activityType: 'Cold Call',
      outcome: 'ATTEMPTED_NO_ANSWER',
      responseCategory: 'NO_RESPONSE',
      notes: 'No answer on direct dial; queued LinkedIn touch next.',
      resultingStatus: 'NO_ANSWER',
    },
    {
      campaignId: cmpUK.id,
      campaignCompanyRecordId: thamesCCR.id,
      companyId: thamesCCR.companyId,
      contactId: insertedContacts[8]!.id,
      createdById: repSofia.id,
      activityDate: daysOffset(-2),
      activityTime: '09:50',
      channel: 'PHONE_CALL',
      activityType: 'Executive Call',
      outcome: 'APPOINTMENT_BOOKED',
      responseCategory: 'MEETING_AGREED',
      notes: 'Oliver agreed to embedded treasury demo with his Head of Product.',
      resultingStatus: 'APPOINTMENT_BOOKED',
    },
    {
      campaignId: cmpUK.id,
      campaignCompanyRecordId: albionCCR.id,
      companyId: albionCCR.companyId,
      contactId: insertedContacts[9]!.id,
      createdById: repSofia.id,
      activityDate: daysOffset(-1),
      activityTime: '10:25',
      channel: 'EMAIL',
      activityType: 'Intro Email',
      outcome: 'EMAIL_SENT',
      responseCategory: 'SEND_EMAIL',
      notes: 'Sent tailored FCA reconciliation note.',
      followUpDate: daysOffset(2),
      resultingStatus: 'EMAIL_SENT',
    },
  ]);

  // 11. Follow-Ups (Today, Overdue, Upcoming, Completed)
  await db.insert(followUps).values([
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: meridianCCR.id,
      companyId: meridianCCR.companyId,
      contactId: insertedContacts[2]!.id,
      assignedToId: repJordan.id,
      followUpType: 'CALL',
      followUpDate: daysOffset(0),
      followUpTime: '14:00',
      reminderMinutes: 30,
      notes: 'Follow up on case study review and propose 30-min technical call.',
      status: 'PENDING',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: stratosCCR.id,
      companyId: stratosCCR.companyId,
      contactId: insertedContacts[3]!.id,
      assignedToId: repJordan.id,
      followUpType: 'CALL',
      followUpDate: daysOffset(-1),
      followUpTime: '11:00',
      reminderMinutes: 15,
      notes: 'Hannah asked to call after board prep (Overdue follow-up).',
      status: 'OVERDUE',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: bluepeakCCR.id,
      companyId: bluepeakCCR.companyId,
      contactId: insertedContacts[6]!.id,
      assignedToId: repDevon.id,
      followUpType: 'EMAIL',
      followUpDate: daysOffset(1),
      followUpTime: '10:00',
      reminderMinutes: 30,
      notes: 'Send calendar invite options for CISO + VP IT alignment.',
      status: 'PENDING',
    },
    {
      campaignId: cmpUK.id,
      campaignCompanyRecordId: albionCCR.id,
      companyId: albionCCR.companyId,
      contactId: insertedContacts[9]!.id,
      assignedToId: repSofia.id,
      followUpType: 'LINKEDIN_MESSAGE',
      followUpDate: daysOffset(0),
      followUpTime: '15:30',
      reminderMinutes: 30,
      notes: 'Check if Freya reviewed the FCA liquidity brief.',
      status: 'PENDING',
    },
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: vanguardCCR.id,
      companyId: vanguardCCR.companyId,
      contactId: insertedContacts[0]!.id,
      assignedToId: repJordan.id,
      followUpType: 'EMAIL',
      followUpDate: daysOffset(-3),
      followUpTime: '14:00',
      reminderMinutes: 30,
      notes: 'Delivered technical deck.',
      status: 'COMPLETED',
      completedAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    },
  ]);

  // 12. Appointments
  await db.insert(appointments).values([
    {
      campaignId: cmpUS.id,
      campaignCompanyRecordId: vanguardCCR.id,
      companyId: vanguardCCR.companyId,
      contactId: insertedContacts[0]!.id,
      prospectName: 'Claire Donovan',
      prospectTitle: 'Chief Technology Officer',
      prospectPhone: '+1-415-555-0141',
      prospectEmail: 'claire.donovan@vanguardcloud.io',
      assignedToId: repJordan.id,
      appointmentDate: daysOffset(2),
      appointmentTime: '11:00',
      timezone: 'America/Los_Angeles',
      meetingType: 'Video Call',
      meetingLink: 'https://meet.cadenceops.io/vanguard-cloud-walkthrough',
      notes: 'Technical architecture walkthrough with NexaCloud Solutions Engineer.',
      requirements: 'AWS multi-account drift detection + SOC 2 evidence export.',
      status: 'CONFIRMED',
      confirmationStatus: 'CONFIRMED',
    },
    {
      campaignId: cmpUK.id,
      campaignCompanyRecordId: thamesCCR.id,
      companyId: thamesCCR.companyId,
      contactId: insertedContacts[8]!.id,
      prospectName: 'Oliver Ashworth',
      prospectTitle: 'Chief Revenue Officer',
      prospectPhone: '+44-20-7946-0821',
      prospectEmail: 'oliver@thamesledger.co.uk',
      assignedToId: repSofia.id,
      appointmentDate: daysOffset(3),
      appointmentTime: '14:30',
      timezone: 'Europe/London',
      meetingType: 'Video Call',
      meetingLink: 'https://meet.cadenceops.io/thames-ledger-demo',
      notes: 'Embedded treasury API scoping session.',
      requirements: 'Real-time GBP/EUR virtual IBAN ledger reconciliation.',
      status: 'SCHEDULED',
      confirmationStatus: 'PENDING',
    },
    {
      campaignId: cmpDACH.id,
      campaignCompanyRecordId: insertedCCRs[12]!.id,
      companyId: insertedCCRs[12]!.companyId,
      contactId: insertedContacts[12]!.id,
      prospectName: 'Lukas Weber',
      prospectTitle: 'VP Global Manufacturing Ops',
      prospectPhone: '+49-89-555-0182',
      prospectEmail: 'l.weber@bavariarobotics.de',
      assignedToId: repJordan.id,
      appointmentDate: daysOffset(-5),
      appointmentTime: '10:00',
      timezone: 'Europe/Berlin',
      meetingType: 'Video Call',
      meetingLink: 'https://meet.cadenceops.io/bavaria-mes-sync',
      notes: 'Completed executive intro; moved to client AE pipeline.',
      requirements: 'SAP S/4HANA plant telemetry connector.',
      status: 'COMPLETED',
      confirmationStatus: 'CONFIRMED',
    },
  ]);

  // 13. Data Requests
  await db.insert(dataRequests).values([
    {
      title: '300 US SaaS CTOs & VPs of Engineering',
      campaignId: cmpUS.id,
      industry: 'Cloud Software / SaaS',
      country: 'United States',
      targetJobTitles: 'CTO, VP Engineering, Head of Infrastructure',
      companySize: '200-1,500 employees',
      quantityRequired: 300,
      reason: 'Current Q4 allocation for West Coast territory is 80% worked.',
      priority: 'HIGH',
      requestedById: repJordan.id,
      status: 'PENDING',
    },
    {
      title: '120 UK Payments & RegTech CFOs',
      campaignId: cmpUK.id,
      industry: 'FinTech / Payments',
      country: 'United Kingdom',
      targetJobTitles: 'CFO, CRO, Head of Partnerships',
      companySize: '50-500 employees',
      quantityRequired: 120,
      reason: 'Expanding Manchester & Edinburgh outreach sprint.',
      priority: 'MEDIUM',
      requestedById: repSofia.id,
      reviewedById: dataMgr.id,
      status: 'APPROVED',
      managerRemarks: 'Approved for Apollo extraction batch IMP-2026-003.',
      fulfilledQuantity: 60,
    },
  ]);

  // 14. Notifications
  await db.insert(notifications).values([
    {
      userId: repJordan.id,
      type: 'FOLLOW_UP_DUE',
      title: 'Follow-up Due Today: Meridian DataWorks',
      message: 'Scheduled call with Victor Chen at 14:00 today.',
      entityType: 'follow_up',
      linkPath: '/follow-ups',
    },
    {
      userId: repJordan.id,
      type: 'FOLLOW_UP_OVERDUE',
      title: 'Overdue Follow-up: Stratos Compute Inc',
      message: 'Callback with Hannah Albright was due yesterday.',
      entityType: 'follow_up',
      linkPath: '/follow-ups',
    },
    {
      userId: admin.id,
      type: 'APPOINTMENT_BOOKED',
      title: 'New Appointment Booked: Vanguard Cloud Systems',
      message: 'Jordan Blake booked a discovery meeting with Claire Donovan (CTO).',
      entityType: 'appointment',
      linkPath: '/appointments',
    },
    {
      userId: dataMgr.id,
      type: 'DATA_REQUEST_CREATED',
      title: 'New Data Request from Jordan Blake',
      message: 'Requested 300 US SaaS CTOs for US IT Decision Makers.',
      entityType: 'data_request',
      linkPath: '/data-requests',
    },
  ]);

  // 15. Leave Requests (HR)
  await db.insert(leaveRequests).values([
    {
      userId: repDevon.id,
      leaveType: 'Annual',
      startDate: daysOffset(12),
      endDate: daysOffset(14),
      reason: 'Family travel',
      status: 'PENDING',
    },
    {
      userId: repSofia.id,
      leaveType: 'Personal',
      startDate: daysOffset(-10),
      endDate: daysOffset(-9),
      reason: 'Personal appointment',
      status: 'APPROVED',
      reviewedById: hrMgr.id,
    },
  ]);

  // 16. Audit Logs
  await db.insert(auditLogs).values([
    {
      userId: dataMgr.id,
      userName: dataMgr.fullName,
      action: 'DATA_IMPORTED',
      entity: 'import_batch',
      entityId: String(batchUS.id),
      newValue: { fileName: batchUS.fileName, importedCompanies: 7, duplicatesDetected: 2 },
    },
    {
      userId: dataMgr.id,
      userName: dataMgr.fullName,
      action: 'DATA_ASSIGNED',
      entity: 'campaign',
      entityId: String(cmpUS.id),
      newValue: { distributedCount: 7, reps: ['Jordan Blake', 'Sofia Alvarez', 'Devon Brooks'] },
    },
    {
      userId: repJordan.id,
      userName: repJordan.fullName,
      action: 'APPOINTMENT_CREATED',
      entity: 'appointment',
      entityId: '1',
      newValue: { company: 'Vanguard Cloud Systems', prospect: 'Claire Donovan' },
    },
  ]);

  await ensureDemoAccounts();
  await ensureEnterpriseSeed();
}
