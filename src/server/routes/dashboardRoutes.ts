import { Router } from 'express';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  activities,
  appointments,
  campaignCompanyRecords,
  campaigns,
  companies,
  contacts,
  dataRequests,
  deals,
  followUps,
  importBatches,
  leaveRequests,
  prospectRemarks,
  users,
} from '../../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../auth.ts';

export const dashboardRouter = Router();

function csvEscape(val: unknown): string {
  let str = val == null ? '' : String(val);
  // Prevent CSV formula injection
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

dashboardRouter.get(
  '/admin',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER', 'HR_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const campaignIdFilter = req.query.campaignId ? Number(req.query.campaignId) : null;
      const salesRepIdFilter = req.query.salesRepId ? Number(req.query.salesRepId) : null;
      const dataManagerIdFilter = req.query.dataManagerId ? Number(req.query.dataManagerId) : null;
      const statusFilter = req.query.status ? String(req.query.status) : null;
      const channelFilter = req.query.channel ? String(req.query.channel) : null;
      const startDate = req.query.startDate ? String(req.query.startDate) : null;
      const endDate = req.query.endDate ? String(req.query.endDate) : null;

      const allCampaigns = await db.select().from(campaigns);
      const filteredCampaigns = dataManagerIdFilter
        ? allCampaigns.filter((c) => c.dataManagerId === dataManagerIdFilter)
        : campaignIdFilter
          ? allCampaigns.filter((c) => c.id === campaignIdFilter)
          : allCampaigns;

      const campaignIdsSet = new Set(filteredCampaigns.map((c) => c.id));

      const [allCompanies, allContacts, allCCRs, allActivities, allFollowUps, allAppointments, allBatches, allUsers, allDeals] =
        await Promise.all([
          db.select().from(companies),
          db.select().from(contacts),
          db.select().from(campaignCompanyRecords),
          db.select().from(activities),
          db.select().from(followUps),
          db.select().from(appointments),
          db.select().from(importBatches),
          db.select().from(users),
          db.select().from(deals),
        ]);

      const scopedCCRs = allCCRs.filter((r) => {
        if (campaignIdFilter && r.campaignId !== campaignIdFilter) return false;
        if (dataManagerIdFilter && !campaignIdsSet.has(r.campaignId)) return false;
        if (salesRepIdFilter && r.assignedToId !== salesRepIdFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        return true;
      });

      const scopedActivities = allActivities.filter((a) => {
        if (campaignIdFilter && a.campaignId !== campaignIdFilter) return false;
        if (dataManagerIdFilter && !campaignIdsSet.has(a.campaignId)) return false;
        if (salesRepIdFilter && a.createdById !== salesRepIdFilter) return false;
        if (channelFilter && a.channel !== channelFilter) return false;
        if (startDate && a.activityDate < startDate) return false;
        if (endDate && a.activityDate > endDate) return false;
        return true;
      });

      const scopedFollowUps = allFollowUps.filter((f) => {
        if (campaignIdFilter && f.campaignId !== campaignIdFilter) return false;
        if (salesRepIdFilter && f.assignedToId !== salesRepIdFilter) return false;
        if (startDate && f.followUpDate < startDate) return false;
        if (endDate && f.followUpDate > endDate) return false;
        return true;
      });

      const scopedAppointments = allAppointments.filter((ap) => {
        if (campaignIdFilter && ap.campaignId !== campaignIdFilter) return false;
        if (salesRepIdFilter && ap.assignedToId !== salesRepIdFilter) return false;
        if (startDate && ap.appointmentDate < startDate) return false;
        if (endDate && ap.appointmentDate > endDate) return false;
        return true;
      });

      const totalDistributed = scopedCCRs.filter((r) => r.assignedToId !== null).length;
      const dataYetToDistribute = scopedCCRs.filter((r) => r.assignedToId === null).length;
      const workedRecords = scopedCCRs.filter((r) => r.status !== 'NOT_YET_WORKED').length;
      const notYetWorked = scopedCCRs.filter((r) => r.status === 'NOT_YET_WORKED').length;

      const summary = {
        totalCompaniesImported: allCompanies.length,
        totalContactsImported: allContacts.length,
        totalUniqueCompanies: allCompanies.length,
        totalCampaigns: filteredCampaigns.length,
        activeCampaigns: filteredCampaigns.filter((c) => c.status === 'ACTIVE').length,
        completedCampaigns: filteredCampaigns.filter((c) => c.status === 'COMPLETED').length,
        totalDataDistributed: totalDistributed,
        dataYetToBeDistributed: dataYetToDistribute,
        totalDataAssigned: totalDistributed,
        dataWorkedOn: workedRecords,
        dataNotYetWorked: notYetWorked,
        totalCalls: scopedActivities.filter((a) => a.channel === 'PHONE_CALL').length,
        totalLinkedInOutreach: scopedActivities.filter(
          (a) => a.channel === 'LINKEDIN_CONNECTION' || a.channel === 'LINKEDIN_MESSAGE'
        ).length,
        totalEmailsSent: scopedActivities.filter((a) => a.channel === 'EMAIL').length,
        totalWhatsAppOutreach: scopedActivities.filter((a) => a.channel === 'WHATSAPP').length,
        totalFollowUpsPending: scopedFollowUps.filter((f) => f.status === 'PENDING' || f.status === 'OVERDUE').length,
        totalAppointmentsBooked: scopedAppointments.filter((a) => a.status !== 'CANCELLED').length,
        totalInterestedProspects: scopedCCRs.filter((r) => r.status === 'INTERESTED').length,
        totalQualifiedLeads: scopedCCRs.filter((r) => r.status === 'QUALIFIED_LEAD' || r.status === 'APPOINTMENT_BOOKED').length,
        totalUnqualifiedLeads: scopedCCRs.filter(
          (r) => r.status === 'NOT_QUALIFIED' || r.status === 'NOT_INTERESTED' || r.status === 'INVALID_DATA'
        ).length,
      };

      // Import trend by date
      const importByDate = new Map<string, { date: string; companies: number; contacts: number; duplicates: number }>();
      for (const b of allBatches) {
        const d = b.createdAt.toISOString().slice(0, 10);
        const cur = importByDate.get(d) || { date: d, companies: 0, contacts: 0, duplicates: 0 };
        cur.companies += b.importedCompanies;
        cur.contacts += b.importedContacts;
        cur.duplicates += b.duplicatesDetected;
        importByDate.set(d, cur);
      }

      // Distribution trend by assigned date
      const distByDate = new Map<string, { date: string; distributed: number; worked: number }>();
      for (const r of scopedCCRs) {
        if (!r.assignedAt) continue;
        const d = r.assignedAt.toISOString().slice(0, 10);
        const cur = distByDate.get(d) || { date: d, distributed: 0, worked: 0 };
        cur.distributed += 1;
        if (r.status !== 'NOT_YET_WORKED') cur.worked += 1;
        distByDate.set(d, cur);
      }

      // Campaign-wise distribution & progress
      const campaignStats = filteredCampaigns.map((c) => {
        const rows = scopedCCRs.filter((r) => r.campaignId === c.id);
        const assigned = rows.filter((r) => r.assignedToId !== null).length;
        const worked = rows.filter((r) => r.status !== 'NOT_YET_WORKED').length;
        const appts = scopedAppointments.filter((a) => a.campaignId === c.id && a.status !== 'CANCELLED').length;
        const interested = rows.filter((r) =>
          ['INTERESTED', 'QUALIFIED_LEAD', 'APPOINTMENT_BOOKED'].includes(r.status)
        ).length;
        return {
          campaignId: c.id,
          name: c.name,
          status: c.status,
          totalRecords: rows.length,
          assigned,
          unassigned: rows.length - assigned,
          worked,
          remaining: Math.max(0, assigned - worked),
          interested,
          appointments: appts,
        };
      });

      // Sales Rep performance
      const salesReps = allUsers.filter((u) => u.role === 'SALES_REP');
      const repPerformance = salesReps.map((rep) => {
        const repRows = scopedCCRs.filter((r) => r.assignedToId === rep.id);
        const repActs = scopedActivities.filter((a) => a.createdById === rep.id);
        const repAppts = scopedAppointments.filter((a) => a.assignedToId === rep.id && a.status !== 'CANCELLED');
        const repFups = scopedFollowUps.filter((f) => f.assignedToId === rep.id);
        return {
          repId: rep.id,
          name: rep.fullName,
          assigned: repRows.length,
          worked: repRows.filter((r) => r.status !== 'NOT_YET_WORKED').length,
          calls: repActs.filter((a) => a.channel === 'PHONE_CALL').length,
          linkedin: repActs.filter((a) => a.channel === 'LINKEDIN_CONNECTION' || a.channel === 'LINKEDIN_MESSAGE').length,
          emails: repActs.filter((a) => a.channel === 'EMAIL').length,
          whatsapp: repActs.filter((a) => a.channel === 'WHATSAPP').length,
          interested: repRows.filter((r) => ['INTERESTED', 'QUALIFIED_LEAD', 'APPOINTMENT_BOOKED'].includes(r.status)).length,
          appointments: repAppts.length,
          followUpsPending: repFups.filter((f) => f.status === 'PENDING' || f.status === 'OVERDUE').length,
        };
      });

      // Activity by date & channel
      const activityByDateMap = new Map<
        string,
        { date: string; calls: number; linkedin: number; emails: number; whatsapp: number; appointments: number; interested: number }
      >();
      for (const act of scopedActivities) {
        const cur = activityByDateMap.get(act.activityDate) || {
          date: act.activityDate,
          calls: 0,
          linkedin: 0,
          emails: 0,
          whatsapp: 0,
          appointments: 0,
          interested: 0,
        };
        if (act.channel === 'PHONE_CALL') cur.calls += 1;
        else if (act.channel === 'LINKEDIN_CONNECTION' || act.channel === 'LINKEDIN_MESSAGE') cur.linkedin += 1;
        else if (act.channel === 'EMAIL') cur.emails += 1;
        else if (act.channel === 'WHATSAPP') cur.whatsapp += 1;
        if (act.resultingStatus === 'APPOINTMENT_BOOKED') cur.appointments += 1;
        if (act.resultingStatus === 'INTERESTED' || act.resultingStatus === 'QUALIFIED_LEAD') cur.interested += 1;
        activityByDateMap.set(act.activityDate, cur);
      }

      const followUpStatusBreakdown = [
        { status: 'Pending', count: scopedFollowUps.filter((f) => f.status === 'PENDING').length },
        { status: 'Overdue', count: scopedFollowUps.filter((f) => f.status === 'OVERDUE').length },
        { status: 'Completed', count: scopedFollowUps.filter((f) => f.status === 'COMPLETED').length },
        { status: 'Rescheduled', count: scopedFollowUps.filter((f) => f.status === 'RESCHEDULED').length },
        { status: 'Cancelled', count: scopedFollowUps.filter((f) => f.status === 'CANCELLED').length },
      ];

      const scopedDeals = allDeals.filter((d) => {
        if (campaignIdFilter && d.campaignId !== campaignIdFilter) return false;
        if (dataManagerIdFilter && d.campaignId && !campaignIdsSet.has(d.campaignId)) return false;
        if (salesRepIdFilter && d.ownerId !== salesRepIdFilter) return false;
        return true;
      });

      const openDeals = scopedDeals.filter((d) => !['CLOSED_WON', 'CLOSED_LOST'].includes(d.stage));
      const wonDeals = scopedDeals.filter((d) => d.stage === 'CLOSED_WON');
      const lostDeals = scopedDeals.filter((d) => d.stage === 'CLOSED_LOST');

      const funnel = [
        { stage: 'Imported', count: scopedCCRs.length },
        { stage: 'Assigned', count: totalDistributed },
        { stage: 'Contacted', count: workedRecords },
        {
          stage: 'Interested',
          count: scopedCCRs.filter((r) => ['INTERESTED', 'QUALIFIED_LEAD', 'APPOINTMENT_BOOKED'].includes(r.status)).length,
        },
        {
          stage: 'Qualified',
          count: scopedCCRs.filter((r) => ['QUALIFIED_LEAD', 'APPOINTMENT_BOOKED'].includes(r.status)).length,
        },
        { stage: 'Appointments Booked', count: summary.totalAppointmentsBooked },
        { stage: 'Closed Won Deals', count: wonDeals.length },
      ];

      const pipelineSummary = {
        openDealsCount: openDeals.length,
        openPipelineValue: openDeals.reduce((sum, d) => sum + d.amount, 0),
        weightedPipelineValue: Math.round(openDeals.reduce((sum, d) => sum + (d.amount * d.probability) / 100, 0)),
        closedWonValue: wonDeals.reduce((sum, d) => sum + d.amount, 0),
        winRate: wonDeals.length + lostDeals.length > 0 ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100) : 0,
      };

      res.json({
        summary,
        funnel,
        pipelineSummary,
        charts: {
          importTrend: Array.from(importByDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
          distributionTrend: Array.from(distByDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
          campaignStats,
          repPerformance,
          activityTrend: Array.from(activityByDateMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
          followUpStatusBreakdown,
        },
        filterOptions: {
          campaigns: allCampaigns.map((c) => ({ id: c.id, name: c.name })),
          salesReps: salesReps.map((u) => ({ id: u.id, name: u.fullName })),
          dataManagers: allUsers
            .filter((u) => u.role === 'DATA_MANAGER' || u.role === 'SUPER_ADMIN')
            .map((u) => ({ id: u.id, name: u.fullName })),
        },
      });
    } catch (error) {
      console.error('Admin dashboard error:', error);
      res.status(500).json({ error: 'Failed to load dashboard metrics.' });
    }
  }
);

dashboardRouter.get('/rep', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.currentUser!;
    // Sales reps can ONLY view their own dashboard
    const targetRepId =
      user.role === 'SALES_REP' ? user.id : req.query.repId ? Number(req.query.repId) : user.id;

    const today = new Date().toISOString().slice(0, 10);

    const [repRecords, repActivities, repFollowUps, repAppointments, allCampaigns] = await Promise.all([
      db.select().from(campaignCompanyRecords).where(eq(campaignCompanyRecords.assignedToId, targetRepId)),
      db.select().from(activities).where(eq(activities.createdById, targetRepId)),
      db.select().from(followUps).where(eq(followUps.assignedToId, targetRepId)),
      db.select().from(appointments).where(eq(appointments.assignedToId, targetRepId)),
      db.select().from(campaigns),
    ]);

    const assignedCampaignIds = new Set(repRecords.map((r) => r.campaignId));
    const myCampaigns = allCampaigns.filter((c) => assignedCampaignIds.has(c.id));

    const notYetWorked = repRecords.filter((r) => r.status === 'NOT_YET_WORKED').length;
    const worked = repRecords.length - notYetWorked;
    const dueToday = repFollowUps.filter((f) => f.status === 'PENDING' && f.followUpDate === today).length;
    const overdue = repFollowUps.filter(
      (f) => f.status === 'OVERDUE' || (f.status === 'PENDING' && f.followUpDate < today)
    ).length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    const dailyMap = new Map<string, { date: string; calls: number; linkedin: number; emails: number; whatsapp: number }>();
    for (const act of repActivities) {
      const cur = dailyMap.get(act.activityDate) || { date: act.activityDate, calls: 0, linkedin: 0, emails: 0, whatsapp: 0 };
      if (act.channel === 'PHONE_CALL') cur.calls += 1;
      else if (act.channel === 'LINKEDIN_CONNECTION' || act.channel === 'LINKEDIN_MESSAGE') cur.linkedin += 1;
      else if (act.channel === 'EMAIL') cur.emails += 1;
      else if (act.channel === 'WHATSAPP') cur.whatsapp += 1;
      dailyMap.set(act.activityDate, cur);
    }

    const [targetUserRows, allReps, allActsGlobal, allApptsGlobal] = await Promise.all([
      db.select().from(users).where(eq(users.id, targetRepId)).limit(1),
      db.select().from(users).where(eq(users.role, 'SALES_REP')),
      db.select().from(activities),
      db.select().from(appointments),
    ]);
    const targetUser = targetUserRows[0];

    const leaderboard = allReps
      .filter((r) => r.isActive)
      .map((r) => ({
        id: r.id,
        fullName: r.fullName,
        todayOutreach: allActsGlobal.filter((a) => a.createdById === r.id && a.activityDate === today).length,
        totalOutreach: allActsGlobal.filter((a) => a.createdById === r.id).length,
        appointmentsBooked: allApptsGlobal.filter((ap) => ap.assignedToId === r.id && ap.status !== 'CANCELLED').length,
      }))
      .sort((a, b) => b.appointmentsBooked - a.appointmentsBooked || b.totalOutreach - a.totalOutreach);

    res.json({
      targets: {
        dailyCallTarget: targetUser?.dailyCallTarget ?? 35,
        dailyOutreachTarget: targetUser?.dailyOutreachTarget ?? 60,
        todayCalls: repActivities.filter((a) => a.activityDate === today && a.channel === 'PHONE_CALL').length,
        todayOutreach: repActivities.filter((a) => a.activityDate === today).length,
      },
      leaderboard,
      summary: {
        assignedCampaigns: myCampaigns.length,
        totalAssignedCompanies: repRecords.length,
        notYetWorked,
        worked,
        researched: repRecords.filter((r) => r.status === 'RESEARCHING').length,
        followUpsDueToday: dueToday,
        overdueFollowUps: overdue,
        followUpsPending: repFollowUps.filter((f) => f.status === 'PENDING' || f.status === 'OVERDUE').length,
        appointmentsBooked: repAppointments.filter((a) => a.status !== 'CANCELLED').length,
        appointmentsCompleted: repAppointments.filter((a) => a.status === 'COMPLETED').length,
        interestedProspects: repRecords.filter((r) => r.status === 'INTERESTED').length,
        qualifiedLeads: repRecords.filter((r) => r.status === 'QUALIFIED_LEAD' || r.status === 'APPOINTMENT_BOOKED').length,
        callsAttempted: repActivities.filter((a) => a.channel === 'PHONE_CALL').length,
        callsConnected: repActivities.filter(
          (a) => a.channel === 'PHONE_CALL' && ['CONNECTED', 'INTERESTED', 'QUALIFIED_LEAD', 'APPOINTMENT_BOOKED', 'FOLLOW_UP_REQUIRED'].includes(a.resultingStatus)
        ).length,
        linkedinConnections: repActivities.filter((a) => a.channel === 'LINKEDIN_CONNECTION').length,
        linkedinMessages: repActivities.filter((a) => a.channel === 'LINKEDIN_MESSAGE').length,
        emailsSent: repActivities.filter((a) => a.channel === 'EMAIL').length,
        whatsappMessages: repActivities.filter((a) => a.channel === 'WHATSAPP').length,
        dailyActivitiesCount: repActivities.filter((a) => a.activityDate === today).length,
        weeklyActivitiesCount: repActivities.filter((a) => a.activityDate >= weekAgoStr).length,
      },
      myCampaigns: myCampaigns.map((c) => ({
        id: c.id,
        campaignCode: c.campaignCode,
        name: c.name,
        status: c.status,
        assignedCount: repRecords.filter((r) => r.campaignId === c.id).length,
        workedCount: repRecords.filter((r) => r.campaignId === c.id && r.status !== 'NOT_YET_WORKED').length,
      })),
      dailyActivityChart: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error('Rep dashboard error:', error);
    res.status(500).json({ error: 'Failed to load representative dashboard.' });
  }
});

dashboardRouter.get(
  '/hr',
  requireAuth,
  requireRole('SUPER_ADMIN', 'HR_MANAGER'),
  async (_req: AuthRequest, res) => {
    try {
      const [allUsers, allLeaves] = await Promise.all([db.select().from(users), db.select().from(leaveRequests)]);

      const byDepartment = new Map<string, number>();
      const byRole = new Map<string, number>();
      for (const u of allUsers) {
        byDepartment.set(u.department, (byDepartment.get(u.department) || 0) + 1);
        byRole.set(u.role, (byRole.get(u.role) || 0) + 1);
      }

      res.json({
        summary: {
          totalEmployees: allUsers.length,
          activeEmployees: allUsers.filter((u) => u.isActive).length,
          inactiveEmployees: allUsers.filter((u) => !u.isActive).length,
          salesReps: allUsers.filter((u) => u.role === 'SALES_REP').length,
          dataManagers: allUsers.filter((u) => u.role === 'DATA_MANAGER').length,
          pendingLeaves: allLeaves.filter((l) => l.status === 'PENDING').length,
        },
        departmentBreakdown: Array.from(byDepartment.entries()).map(([department, count]) => ({ department, count })),
        roleBreakdown: Array.from(byRole.entries()).map(([role, count]) => ({ role, count })),
      });
    } catch (error) {
      console.error('HR dashboard error:', error);
      res.status(500).json({ error: 'Failed to load HR overview.' });
    }
  }
);

dashboardRouter.get(
  '/reports/overview',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const startDate = req.query.startDate ? String(req.query.startDate) : null;
      const endDate = req.query.endDate ? String(req.query.endDate) : null;
      const campaignId = req.query.campaignId ? Number(req.query.campaignId) : null;
      const repId = req.query.repId ? Number(req.query.repId) : null;
      const dataManagerId = req.query.dataManagerId ? Number(req.query.dataManagerId) : null;
      const channel = req.query.channel ? String(req.query.channel) : null;
      const outcome = req.query.outcome ? String(req.query.outcome) : null;

      const [allUsers, allCampaigns, allCCRs, allActivities, allFollowUps, allAppointments, allBatches, allRequests, allCompanies, allContacts, allRemarks] =
        await Promise.all([
          db.select().from(users),
          db.select().from(campaigns),
          db.select().from(campaignCompanyRecords),
          db.select().from(activities).orderBy(desc(activities.createdAt)),
          db.select().from(followUps),
          db.select().from(appointments),
          db.select().from(importBatches),
          db.select().from(dataRequests),
          db.select().from(companies),
          db.select().from(contacts),
          db.select().from(prospectRemarks).orderBy(desc(prospectRemarks.isPinned), desc(prospectRemarks.createdAt)),
        ]);

      const userMap = new Map(allUsers.map((u) => [u.id, u]));
      const campaignMap = new Map(allCampaigns.map((c) => [c.id, c]));
      const companyMap = new Map(allCompanies.map((c) => [c.id, c]));
      const contactMap = new Map(allContacts.map((c) => [c.id, c]));

      const filteredActivities = allActivities.filter((a) => {
        if (campaignId && a.campaignId !== campaignId) return false;
        if (repId && a.createdById !== repId) return false;
        if (channel && a.channel !== channel) return false;
        if (outcome && a.outcome !== outcome) return false;
        if (startDate && a.activityDate < startDate) return false;
        if (endDate && a.activityDate > endDate) return false;
        if (dataManagerId) {
          const cmp = campaignMap.get(a.campaignId);
          if (!cmp || cmp.dataManagerId !== dataManagerId) return false;
        }
        return true;
      });

      const employeePerformance = allUsers
        .filter((u) => u.role === 'SALES_REP')
        .map((rep) => {
          const assignedRows = allCCRs.filter((r) => r.assignedToId === rep.id && (!campaignId || r.campaignId === campaignId));
          const repActs = filteredActivities.filter((a) => a.createdById === rep.id);
          const repFups = allFollowUps.filter((f) => f.assignedToId === rep.id);
          const completedFups = repFups.filter((f) => f.status === 'COMPLETED').length;
          const repAppts = allAppointments.filter((a) => a.assignedToId === rep.id && a.status !== 'CANCELLED');
          const callsAttempted = repActs.filter((a) => a.channel === 'PHONE_CALL').length;
          const connectedCalls = repActs.filter(
            (a) => a.channel === 'PHONE_CALL' && !['ATTEMPTED_NO_ANSWER', 'INVALID_CONTACT', 'WRONG_CONTACT'].includes(a.outcome)
          ).length;

          return {
            id: rep.id,
            name: rep.fullName,
            email: rep.email,
            assignedData: assignedRows.length,
            workedData: assignedRows.filter((r) => r.status !== 'NOT_YET_WORKED').length,
            callAttempts: callsAttempted,
            connectedCalls,
            linkedinOutreach: repActs.filter((a) => a.channel === 'LINKEDIN_CONNECTION' || a.channel === 'LINKEDIN_MESSAGE').length,
            emails: repActs.filter((a) => a.channel === 'EMAIL').length,
            whatsapp: repActs.filter((a) => a.channel === 'WHATSAPP').length,
            interestedProspects: assignedRows.filter((r) => r.status === 'INTERESTED').length,
            qualifiedLeads: assignedRows.filter((r) => r.status === 'QUALIFIED_LEAD' || r.status === 'APPOINTMENT_BOOKED').length,
            appointments: repAppts.length,
            followUpCompletionRate: repFups.length > 0 ? Math.round((completedFups / repFups.length) * 100) : 0,
            conversionRate: assignedRows.length > 0 ? Math.round((repAppts.length / assignedRows.length) * 100) : 0,
          };
        });

      const campaignPerformance = allCampaigns.map((c) => {
        const rows = allCCRs.filter((r) => r.campaignId === c.id);
        const assigned = rows.filter((r) => r.assignedToId !== null).length;
        const worked = rows.filter((r) => r.status !== 'NOT_YET_WORKED').length;
        const cmpActs = filteredActivities.filter((a) => a.campaignId === c.id);
        const cmpAppts = allAppointments.filter((a) => a.campaignId === c.id && a.status !== 'CANCELLED');
        const interested = rows.filter((r) => ['INTERESTED', 'QUALIFIED_LEAD', 'APPOINTMENT_BOOKED'].includes(r.status)).length;
        return {
          id: c.id,
          campaignCode: c.campaignCode,
          name: c.name,
          status: c.status,
          importedCompanies: rows.length,
          assigned,
          worked,
          remaining: Math.max(0, rows.length - worked),
          calls: cmpActs.filter((a) => a.channel === 'PHONE_CALL').length,
          totalOutreach: cmpActs.length,
          interestedProspects: interested,
          appointments: cmpAppts.length,
          conversionRate: worked > 0 ? Math.round((cmpAppts.length / worked) * 100) : 0,
        };
      });

      const dataManagerPerformance = allUsers
        .filter((u) => u.role === 'DATA_MANAGER' || u.role === 'SUPER_ADMIN')
        .map((dm) => {
          const dmBatches = allBatches.filter((b) => b.importedById === dm.id);
          const dmCampaigns = allCampaigns.filter((c) => c.dataManagerId === dm.id || c.createdById === dm.id);
          const dmDistributed = allCCRs.filter((r) => r.assignedById === dm.id).length;
          const dmFulfilled = allRequests.filter((r) => r.reviewedById === dm.id && r.status === 'FULFILLED').length;
          return {
            id: dm.id,
            name: dm.fullName,
            role: dm.role,
            totalBatches: dmBatches.length,
            totalImported: dmBatches.reduce((acc, b) => acc + b.importedCompanies, 0),
            duplicatesDetected: dmBatches.reduce((acc, b) => acc + b.duplicatesDetected, 0),
            recordsDistributed: dmDistributed,
            campaignsManaged: dmCampaigns.length,
            requestsFulfilled: dmFulfilled,
          };
        });

      const activityLogs = filteredActivities.slice(0, 200).map((a) => ({
        id: a.id,
        date: a.activityDate,
        time: a.activityTime,
        campaignName: campaignMap.get(a.campaignId)?.name || 'Campaign',
        companyName: companyMap.get(a.companyId)?.name || 'Company',
        contactName: a.contactId ? contactMap.get(a.contactId)?.fullName || '-' : '-',
        repName: userMap.get(a.createdById)?.fullName || 'Rep',
        channel: a.channel,
        activityType: a.activityType,
        outcome: a.outcome,
        resultingStatus: a.resultingStatus,
        notes: a.notes,
      }));

      const prospectRemarksList = allRemarks
        .filter((rm) => (!campaignId || rm.campaignId === campaignId) && (!repId || rm.authorId === repId))
        .slice(0, 200)
        .map((rm) => ({
          id: rm.id,
          createdAt: rm.createdAt,
          campaignName: campaignMap.get(rm.campaignId)?.name || 'Campaign',
          companyName: companyMap.get(rm.companyId)?.name || 'Company',
          contactName: rm.contactId ? contactMap.get(rm.contactId)?.fullName || '-' : '-',
          authorName: userMap.get(rm.authorId)?.fullName || 'Team Member',
          category: rm.category,
          isPinned: rm.isPinned,
          content: rm.content,
        }));

      res.json({
        employeePerformance,
        campaignPerformance,
        dataManagerPerformance,
        activityLogs,
        prospectRemarks: prospectRemarksList,
      });
    } catch (error) {
      console.error('Reports overview error:', error);
      res.status(500).json({ error: 'Failed to generate reports.' });
    }
  }
);

dashboardRouter.get(
  '/reports/export',
  requireAuth,
  requireRole('SUPER_ADMIN', 'DATA_MANAGER', 'CAMPAIGN_MANAGER'),
  async (req: AuthRequest, res) => {
    try {
      const type = String(req.query.type || 'activities');
      const [allUsers, allCampaigns, allCompanies, allContacts, allActivities, allCCRs, allAppointments, allRemarks] =
        await Promise.all([
          db.select().from(users),
          db.select().from(campaigns),
          db.select().from(companies),
          db.select().from(contacts),
          db.select().from(activities).orderBy(desc(activities.createdAt)),
          db.select().from(campaignCompanyRecords),
          db.select().from(appointments),
          db.select().from(prospectRemarks).orderBy(desc(prospectRemarks.isPinned), desc(prospectRemarks.createdAt)),
        ]);

      const userMap = new Map(allUsers.map((u) => [u.id, u.fullName]));
      const campaignMap = new Map(allCampaigns.map((c) => [c.id, c.name]));
      const companyMap = new Map(allCompanies.map((c) => [c.id, c.name]));
      const contactMap = new Map(allContacts.map((c) => [c.id, c.fullName]));

      let rows: string[][] = [];
      let filename = `cadenceops_${type}_${new Date().toISOString().slice(0, 10)}.csv`;

      if (type === 'campaigns') {
        rows.push(['Campaign Code', 'Campaign Name', 'Status', 'Total Companies', 'Assigned', 'Worked', 'Appointments']);
        for (const c of allCampaigns) {
          const cRows = allCCRs.filter((r) => r.campaignId === c.id);
          const appts = allAppointments.filter((a) => a.campaignId === c.id && a.status !== 'CANCELLED').length;
          rows.push([
            c.campaignCode,
            c.name,
            c.status,
            String(cRows.length),
            String(cRows.filter((r) => r.assignedToId !== null).length),
            String(cRows.filter((r) => r.status !== 'NOT_YET_WORKED').length),
            String(appts),
          ]);
        }
      } else if (type === 'remarks') {
        rows.push(['Created At', 'Campaign', 'Company', 'Contact', 'Author', 'Category', 'Pinned', 'Remark']);
        for (const rm of allRemarks) {
          rows.push([
            new Date(rm.createdAt).toISOString().slice(0, 16).replace('T', ' '),
            campaignMap.get(rm.campaignId) || '',
            companyMap.get(rm.companyId) || '',
            rm.contactId ? contactMap.get(rm.contactId) || '' : '',
            userMap.get(rm.authorId) || '',
            rm.category,
            rm.isPinned ? 'YES' : 'NO',
            rm.content,
          ]);
        }
      } else {
        rows.push(['Date', 'Time', 'Campaign', 'Company', 'Contact', 'Representative', 'Channel', 'Outcome', 'Resulting Status', 'Notes']);
        for (const a of allActivities) {
          rows.push([
            a.activityDate,
            a.activityTime,
            campaignMap.get(a.campaignId) || '',
            companyMap.get(a.companyId) || '',
            a.contactId ? contactMap.get(a.contactId) || '' : '',
            userMap.get(a.createdById) || '',
            a.channel,
            a.outcome,
            a.resultingStatus,
            a.notes || '',
          ]);
        }
      }

      const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('Export report error:', error);
      res.status(500).json({ error: 'Failed to export report.' });
    }
  }
);
