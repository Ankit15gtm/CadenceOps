import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  Edit3,
  ExternalLink,
  Flag,
  GitBranch,
  Mail,
  MessageSquare,
  Pause,
  Phone,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldBan,
  Square,
  StepForward,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatCodeLabel, safeExternalUrl } from '../lib/utils.ts';
import { DEAL_STAGES } from '../lib/deals.ts';
import {
  getRemarkCategoryLabel,
  getRemarkCategoryStyle,
  getSentimentStyle,
  REMARK_CATEGORIES,
  SENTIMENT_OPTIONS,
} from '../lib/remarks.ts';
import {
  createGoogleCalendarAppointment,
  downloadAppointmentIcs,
  fetchContactGmailThreads,
  type GmailThreadPreview,
  renderMergeTags,
  sendGmailEmail,
} from '../lib/googleWorkspace.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

const PRESET_FILTERS = [
  { id: '', label: 'All Assigned' },
  { id: 'DUE_TODAY', label: 'Due Today' },
  { id: 'NOT_YET_WORKED', label: 'Not Yet Worked' },
  { id: 'WORKED', label: 'Worked' },
  { id: 'INTERESTED', label: 'Interested' },
  { id: 'FOLLOW_UP', label: 'Follow-up' },
  { id: 'APPOINTMENT', label: 'Appointment' },
  { id: 'NOT_INTERESTED', label: 'Not Interested' },
];

const RESPONSE_CATEGORIES = [
  { value: 'INTERESTED', label: 'Interested in Product / Service' },
  { value: 'SEND_EMAIL', label: 'Prospect Asked to Send Email' },
  { value: 'CALL_LATER', label: 'Call Later / Not Available Now' },
  { value: 'WHATSAPP_FOLLOW_UP', label: 'Requested WhatsApp Follow-up' },
  { value: 'MEETING_AGREED', label: 'Prospect Agreed to Meeting' },
  { value: 'MEETING_PENDING', label: 'Meeting Pending Confirmation' },
  { value: 'NO_RESPONSE', label: 'No Response / Voicemail' },
  { value: 'NOT_INTERESTED', label: 'Prospect Declined / Not Interested' },
  { value: 'WRONG_CONTACT', label: 'Wrong Contact' },
  { value: 'DO_NOT_CONTACT', label: 'Asked Not to Be Contacted Again' },
  { value: 'OTHER', label: 'Other' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Australia/Sydney',
];

function inferTimezone(explicitTz?: string | null, country?: string | null): string {
  if (explicitTz) return explicitTz;
  const c = (country || '').toLowerCase();
  if (c.includes('uk') || c.includes('united kingdom') || c.includes('britain')) return 'Europe/London';
  if (c.includes('germany') || c.includes('france') || c.includes('europe') || c.includes('netherlands')) return 'Europe/Berlin';
  if (c.includes('singapore')) return 'Asia/Singapore';
  if (c.includes('india')) return 'Asia/Kolkata';
  if (c.includes('australia')) return 'Australia/Sydney';
  return 'America/New_York';
}

function getLocalClockSummary(tz: string): { timeStr: string; inWindow: boolean } {
  try {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      weekday: 'short',
    }).format(now);
    const hour24 = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour: '2-digit',
        hour12: false,
      }).format(now)
    );
    const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const isWeekend = dayStr === 'Sat' || dayStr === 'Sun';
    return { timeStr, inWindow: !isWeekend && hour24 >= 8 && hour24 < 18 };
  } catch {
    return { timeStr: 'Unknown', inWindow: true };
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function ProspectingWorkspacePage({
  initialRecordId,
  onClearInitialRecord,
}: {
  initialRecordId?: number | null;
  onClearInitialRecord?: () => void;
}) {
  const { user, outcomeRules, refreshProfile, googleAccessToken, connectGoogleWorkspace } = useAuth();
  const [records, setRecords] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [preset, setPreset] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [activeRecordId, setActiveRecordId] = useState<number | null>(initialRecordId || null);
  const [workspaceDetail, setWorkspaceDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Activity form
  const [actForm, setActForm] = useState({
    contactId: '',
    channel: 'PHONE_CALL',
    activityDate: new Date().toISOString().slice(0, 10),
    activityTime: new Date().toTimeString().slice(0, 5),
    outcome: 'CONNECTED_CONVERSATION',
    responseCategory: 'INTERESTED',
    notes: '',
    followUpDate: '',
    followUpTime: '10:00',
    followUpType: 'CALL',
    durationSeconds: '',
    recordingUrl: '',
  });

  // Live Call Timer
  const [callRunning, setCallRunning] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [selectedScriptId, setSelectedScriptId] = useState('');

  // Gmail & Messaging state
  const [gmailOpen, setGmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedEmailTemplateId, setSelectedEmailTemplateId] = useState('');
  const [gmailConfirmOpen, setGmailConfirmOpen] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);
  const [gmailThreads, setGmailThreads] = useState<GmailThreadPreview[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);

  // Social / WhatsApp template copier
  const [quickMsgChannel, setQuickMsgChannel] = useState<'LINKEDIN_MESSAGE' | 'WHATSAPP'>('LINKEDIN_MESSAGE');
  const [quickMsgText, setQuickMsgText] = useState('');

  // Sequence enrollment
  const [enrollSeqId, setEnrollSeqId] = useState('');

  // Inline edit modals
  const [editCompanyOpen, setEditCompanyOpen] = useState(false);
  const [companyEditForm, setCompanyEditForm] = useState<any>({});
  const [editContact, setEditContact] = useState<any>(null);

  // Data Flag modal
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagForm, setFlagForm] = useState({ contactId: '', issueType: 'BOUNCED_EMAIL', proposedFix: '', notes: '' });

  // DNC Confirmation modal
  const [dncConfirm, setDncConfirm] = useState<{ type: 'EMAIL' | 'DOMAIN' | 'PHONE'; value: string; label: string } | null>(null);

  // Appointment modal + Google Calendar confirmation
  const [apptOpen, setApptOpen] = useState(false);
  const [apptSyncCalendar, setApptSyncCalendar] = useState(true);
  const [apptCalendarConfirmOpen, setApptCalendarConfirmOpen] = useState(false);
  const [apptForm, setApptForm] = useState({
    contactId: '',
    prospectName: '',
    prospectTitle: '',
    prospectPhone: '',
    prospectEmail: '',
    appointmentDate: '',
    appointmentTime: '11:00',
    timezone: 'America/New_York',
    meetingType: 'Video Call',
    meetingLink: '',
    notes: '',
    requirements: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Prospect Summary & Remarks state
  const [summaryDraft, setSummaryDraft] = useState('');
  const [sentimentDraft, setSentimentDraft] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);
  const [remarkForm, setRemarkForm] = useState({
    category: 'GENERAL',
    contactId: '',
    content: '',
    isPinned: false,
  });
  const [remarkFilter, setRemarkFilter] = useState('ALL');
  const [savingRemark, setSavingRemark] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<number | null>(null);
  const [editingRemarkDraft, setEditingRemarkDraft] = useState({ category: 'GENERAL', content: '', isPinned: false });
  const [customFieldKeys, setCustomFieldKeys] = useState<string[]>([]);
  const [dealOpen, setDealOpen] = useState(false);
  const [savingDeal, setSavingDeal] = useState(false);
  const [dealForm, setDealForm] = useState({
    title: '',
    stage: 'DISCOVERY',
    amount: '35000',
    probability: '25',
    expectedCloseDate: '',
    notes: '',
  });

  useEffect(() => {
    if (!callRunning) return;
    const timer = setInterval(() => {
      setCallSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callRunning]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (preset) params.set('preset', preset);
      if (campaignId) params.set('campaignId', campaignId);
      if (search) params.set('search', search);
      const [recRes, cmpRes, cfRes] = await Promise.all([
        apiFetch(`/api/workspace/records?${params.toString()}`),
        apiFetch('/api/campaigns'),
        apiFetch<{ companyFields: string[] }>('/api/custom-fields').catch(() => ({ companyFields: [] })),
      ]);
      setRecords(recRes.records);
      setCampaigns(cmpRes.campaigns);
      setCustomFieldKeys(cfRes.companyFields || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load prospecting queue');
    } finally {
      setLoading(false);
    }
  }, [preset, campaignId, search]);

  const loadDetail = useCallback(async (recordId: number) => {
    setDetailLoading(true);
    try {
      const res = await apiFetch(`/api/workspace/records/${recordId}`);
      setWorkspaceDetail(res);
      setSummaryDraft(res.record?.prospectSummary || '');
      setSentimentDraft(res.record?.prospectSentiment || '');
      const primary = res.contacts?.[0];
      const tz = inferTimezone(res.company?.timezone, res.company?.country);
      if (primary) {
        setActForm((f) => ({ ...f, contactId: String(primary.id) }));
        setRemarkForm((f) => ({ ...f, contactId: String(primary.id) }));
        setEmailTo(primary.workEmail || '');
        setApptForm((f) => ({
          ...f,
          contactId: String(primary.id),
          prospectName: primary.fullName || '',
          prospectTitle: primary.jobTitle || '',
          prospectPhone: primary.phone || '',
          prospectEmail: primary.workEmail || '',
          timezone: tz,
        }));
      } else {
        setRemarkForm((f) => ({ ...f, contactId: '' }));
        setEmailTo('');
        setApptForm((f) => ({ ...f, timezone: tz }));
      }
      if (res.availableSequences?.length > 0) {
        setEnrollSeqId(String(res.availableSequences[0].id));
      }
      const firstScript = (res.templates || []).find((t: any) => t.channel === 'CALL_SCRIPT');
      if (firstScript) setSelectedScriptId(String(firstScript.id));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load prospect details');
      setActiveRecordId(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (initialRecordId) {
      setActiveRecordId(initialRecordId);
    }
  }, [initialRecordId]);

  useEffect(() => {
    if (activeRecordId) {
      loadDetail(activeRecordId);
      setGmailThreads([]);
      setCallRunning(false);
      setCallSeconds(0);
    }
  }, [activeRecordId, loadDetail]);

  const selectedContact = useMemo(() => {
    const list = workspaceDetail?.contacts || [];
    return list.find((c: any) => String(c.id) === actForm.contactId) || list[0] || null;
  }, [workspaceDetail, actForm.contactId]);

  const mergeCtx = useMemo(
    () => ({
      firstName: selectedContact?.firstName,
      fullName: selectedContact?.fullName,
      companyName: workspaceDetail?.company?.name,
      jobTitle: selectedContact?.jobTitle,
      senderName: user?.fullName,
    }),
    [selectedContact, workspaceDetail, user]
  );

  const currentQueueIndex = useMemo(() => {
    if (!activeRecordId) return -1;
    return records.findIndex((r) => r.id === activeRecordId);
  }, [records, activeRecordId]);

  const prevRecordId = currentQueueIndex > 0 ? records[currentQueueIndex - 1]?.id || null : null;
  const nextRecordId =
    currentQueueIndex >= 0 && currentQueueIndex < records.length - 1 ? records[currentQueueIndex + 1]?.id || null : null;

  const handleLogActivity = async (e: React.FormEvent, advanceNext = false) => {
    e.preventDefault();
    if (!activeRecordId) return;
    if (selectedContact?.doNotContact && actForm.outcome !== 'DO_NOT_CONTACT') {
      toast.error('This contact is marked Do Not Contact. Remove DNC status before logging outreach.');
      return;
    }
    const targetNextId = advanceNext ? nextRecordId : null;
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          campaignCompanyRecordId: activeRecordId,
          contactId: actForm.contactId ? Number(actForm.contactId) : null,
          channel: actForm.channel,
          activityDate: actForm.activityDate,
          activityTime: actForm.activityTime,
          outcome: actForm.outcome,
          responseCategory: actForm.responseCategory,
          notes: actForm.notes,
          followUpDate: actForm.followUpDate || null,
          followUpTime: actForm.followUpTime,
          followUpType: actForm.followUpType,
          durationSeconds: actForm.durationSeconds ? Number(actForm.durationSeconds) : callSeconds > 0 ? callSeconds : null,
          recordingUrl: actForm.recordingUrl || null,
        }),
      });
      setCallRunning(false);
      setCallSeconds(0);
      setActForm((f) => ({ ...f, notes: '', followUpDate: '', durationSeconds: '', recordingUrl: '' }));
      if (advanceNext && targetNextId) {
        toast.success(`Logged (${formatCodeLabel(res.resultingStatus)}). Advancing to next prospect.`);
        setActiveRecordId(targetNextId);
        await Promise.all([loadList(), refreshProfile()]);
      } else if (advanceNext && !targetNextId) {
        toast.success(`Logged (${formatCodeLabel(res.resultingStatus)}). Reached end of current queue.`);
        await Promise.all([loadDetail(activeRecordId), loadList(), refreshProfile()]);
      } else {
        toast.success(`Activity logged. Status updated to ${formatCodeLabel(res.resultingStatus)}.`);
        await Promise.all([loadDetail(activeRecordId), loadList(), refreshProfile()]);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceDetail?.company || !workspaceDetail?.campaign || !activeRecordId) return;
    setSavingDeal(true);
    try {
      await apiFetch('/api/deals', {
        method: 'POST',
        body: JSON.stringify({
          title: dealForm.title,
          companyId: workspaceDetail.company.id,
          campaignId: workspaceDetail.campaign.id,
          campaignCompanyRecordId: activeRecordId,
          contactId: selectedContact?.id || null,
          stage: dealForm.stage,
          amount: Number(dealForm.amount || 0),
          probability: Number(dealForm.probability || 20),
          expectedCloseDate: dealForm.expectedCloseDate || null,
          notes: dealForm.notes || null,
        }),
      });
      toast.success('Opportunity created in Deal Pipeline.');
      setDealOpen(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create deal');
    } finally {
      setSavingDeal(false);
    }
  };

  const openBookAppointmentFlow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecordId) return;
    if (apptSyncCalendar) {
      setApptCalendarConfirmOpen(true);
    } else {
      void finalizeBookAppointment(false);
    }
  };

  const finalizeBookAppointment = async (syncToGoogle: boolean) => {
    if (!activeRecordId) return;
    setSubmitting(true);
    try {
      let googleEventId: string | null = null;
      let meetingLink = apptForm.meetingLink;

      if (syncToGoogle) {
        let token = googleAccessToken;
        if (!token) {
          token = await connectGoogleWorkspace();
        }
        if (!token) {
          throw new Error('Google Workspace permission is required to sync to Google Calendar.');
        }
        const createdCal = await createGoogleCalendarAppointment(token, {
          summary: `Discovery Call — ${workspaceDetail?.company?.name || apptForm.prospectName}`,
          description: `${apptForm.requirements || ''}\n${apptForm.notes || ''}`.trim(),
          date: apptForm.appointmentDate,
          time: apptForm.appointmentTime,
          timeZone: apptForm.timezone,
          attendeeEmail: apptForm.prospectEmail,
        });
        googleEventId = createdCal.eventId;
        if (!meetingLink && createdCal.meetLink) {
          meetingLink = createdCal.meetLink;
        }
      }

      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          campaignCompanyRecordId: activeRecordId,
          ...apptForm,
          meetingLink,
          googleEventId,
          calendarSynced: Boolean(googleEventId),
          contactId: apptForm.contactId ? Number(apptForm.contactId) : null,
        }),
      });

      toast.success(
        googleEventId
          ? 'Appointment scheduled and synced to Google Calendar with Meet invite.'
          : 'Appointment scheduled and status updated.'
      );
      setApptCalendarConfirmOpen(false);
      setApptOpen(false);
      await Promise.all([loadDetail(activeRecordId), loadList(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadGmailThreads = async () => {
    const email = selectedContact?.workEmail || emailTo;
    if (!email) {
      toast.error('No prospect email address on this contact.');
      return;
    }
    setLoadingThreads(true);
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await connectGoogleWorkspace();
      }
      if (!token) {
        toast.error('Google Workspace sign-in is required to read Gmail threads.');
        return;
      }
      const threads = await fetchContactGmailThreads(token, email);
      setGmailThreads(threads);
      if (threads.length === 0) {
        toast.info(`No prior Gmail threads found for ${email}.`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Could not fetch Gmail history');
    } finally {
      setLoadingThreads(false);
    }
  };

  const handleConfirmedSendGmail = async () => {
    if (!activeRecordId) return;
    setSendingGmail(true);
    try {
      let token = googleAccessToken;
      if (!token) {
        token = await connectGoogleWorkspace();
      }
      if (!token) {
        throw new Error('Google Workspace authorization was not granted.');
      }
      const sent = await sendGmailEmail(token, {
        to: emailTo.trim(),
        subject: emailSubject.trim(),
        body: emailBody,
      });

      await apiFetch('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          campaignCompanyRecordId: activeRecordId,
          contactId: selectedContact?.id || null,
          channel: 'EMAIL',
          outcome: 'SENT_INTRO',
          responseCategory: 'SEND_EMAIL',
          notes: `Sent Gmail to ${emailTo.trim()}\nSubject: ${emailSubject.trim()}\n\n${emailBody.slice(0, 400)}`,
          emailSubject: emailSubject.trim(),
          externalMessageId: sent.id,
        }),
      });

      toast.success(`Email sent via Gmail to ${emailTo.trim()} and logged.`);
      setGmailConfirmOpen(false);
      setGmailOpen(false);
      await Promise.all([loadDetail(activeRecordId), loadList(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send email via Gmail');
    } finally {
      setSendingGmail(false);
    }
  };

  const handleEnrollSequence = async () => {
    if (!activeRecordId || !enrollSeqId) return;
    try {
      await apiFetch(`/api/sequences/${enrollSeqId}/enroll`, {
        method: 'POST',
        body: JSON.stringify({
          recordIds: [activeRecordId],
          contactId: selectedContact?.id || null,
        }),
      });
      toast.success('Enrolled prospect into multi-touch sequence & created Step 1 follow-up.');
      await loadDetail(activeRecordId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to enroll in sequence');
    }
  };

  const handleSequenceAction = async (enrollmentId: number, action: 'PAUSE' | 'RESUME' | 'ADVANCE' | 'STOP') => {
    if (!activeRecordId) return;
    try {
      await apiFetch(`/api/sequence-enrollments/${enrollmentId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      toast.success(`Sequence updated (${action.toLowerCase()}).`);
      await loadDetail(activeRecordId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update sequence');
    }
  };

  const handleSaveCompanyEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceDetail?.company || !activeRecordId) return;
    try {
      await apiFetch(`/api/companies/${workspaceDetail.company.id}`, {
        method: 'PATCH',
        body: JSON.stringify(companyEditForm),
      });
      toast.success('Company details updated.');
      setEditCompanyOpen(false);
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update company');
    }
  };

  const handleSaveContactEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editContact || !activeRecordId) return;
    try {
      await apiFetch(`/api/contacts/${editContact.id}`, {
        method: 'PATCH',
        body: JSON.stringify(editContact),
      });
      toast.success('Contact updated.');
      setEditContact(null);
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update contact');
    }
  };

  const handleCreateFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceDetail?.company || !activeRecordId) return;
    try {
      await apiFetch('/api/data-flags', {
        method: 'POST',
        body: JSON.stringify({
          campaignCompanyRecordId: activeRecordId,
          companyId: workspaceDetail.company.id,
          contactId: flagForm.contactId ? Number(flagForm.contactId) : null,
          issueType: flagForm.issueType,
          proposedFix: flagForm.proposedFix,
          notes: flagForm.notes,
        }),
      });
      toast.success('Data correction flag sent to Data Managers.');
      setFlagOpen(false);
      setFlagForm({ contactId: '', issueType: 'BOUNCED_EMAIL', proposedFix: '', notes: '' });
      await loadDetail(activeRecordId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to report data flag');
    }
  };

  const handleConfirmDnc = async () => {
    if (!dncConfirm || !activeRecordId) return;
    try {
      await apiFetch('/api/dnc', {
        method: 'POST',
        body: JSON.stringify({
          type: dncConfirm.type,
          value: dncConfirm.value,
          reason: `Added from Prospecting Workspace (${workspaceDetail?.company?.name})`,
        }),
      });
      toast.success(`Added ${dncConfirm.value} to Global DNC Suppression List.`);
      setDncConfirm(null);
      await loadDetail(activeRecordId);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add to Global DNC');
    }
  };

  const handleSaveSummary = async () => {
    if (!activeRecordId) return;
    setSavingSummary(true);
    try {
      await apiFetch(`/api/workspace/records/${activeRecordId}/summary`, {
        method: 'PATCH',
        body: JSON.stringify({
          prospectSummary: summaryDraft,
          prospectSentiment: sentimentDraft || null,
        }),
      });
      toast.success('Prospect understanding & brief saved.');
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save prospect brief');
    } finally {
      setSavingSummary(false);
    }
  };

  const handleAddRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecordId || !remarkForm.content.trim()) return;
    setSavingRemark(true);
    try {
      await apiFetch(`/api/workspace/records/${activeRecordId}/remarks`, {
        method: 'POST',
        body: JSON.stringify({
          category: remarkForm.category,
          contactId: remarkForm.contactId ? Number(remarkForm.contactId) : null,
          content: remarkForm.content.trim(),
          isPinned: remarkForm.isPinned,
        }),
      });
      toast.success('Prospect remark added.');
      setRemarkForm((f) => ({ ...f, content: '', isPinned: false }));
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add remark');
    } finally {
      setSavingRemark(false);
    }
  };

  const handleTogglePinRemark = async (remark: any) => {
    if (!activeRecordId) return;
    try {
      await apiFetch(`/api/remarks/${remark.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPinned: !remark.isPinned }),
      });
      toast.success(remark.isPinned ? 'Remark unpinned.' : 'Remark pinned to top.');
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update remark');
    }
  };

  const handleSaveEditRemark = async (remarkId: number) => {
    if (!activeRecordId || !editingRemarkDraft.content.trim()) return;
    try {
      await apiFetch(`/api/remarks/${remarkId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          category: editingRemarkDraft.category,
          content: editingRemarkDraft.content.trim(),
          isPinned: editingRemarkDraft.isPinned,
        }),
      });
      toast.success('Remark updated.');
      setEditingRemarkId(null);
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update remark');
    }
  };

  const handleDeleteRemark = async (remarkId: number) => {
    if (!activeRecordId) return;
    try {
      await apiFetch(`/api/remarks/${remarkId}`, { method: 'DELETE' });
      toast.success('Remark removed.');
      await Promise.all([loadDetail(activeRecordId), loadList()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete remark');
    }
  };

  const selectedOutcomeRule = outcomeRules.find((r) => r.outcome === actForm.outcome);

  // ==================== DETAIL WORKSPACE VIEW ====================
  if (activeRecordId) {
    if (detailLoading || !workspaceDetail) {
      return <div className="h-72 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900" />;
    }

    const {
      record,
      company,
      campaign,
      contacts: compContacts,
      activities: timeline,
      templates = [],
      availableSequences = [],
      sequenceEnrollments = [],
      dataFlags = [],
      remarks = [],
      appointments: recordAppts = [],
    } = workspaceDetail;

    const filteredRemarks = remarks.filter((rm: any) => {
      if (remarkFilter === 'PINNED') return Boolean(rm.isPinned);
      if (remarkFilter !== 'ALL') return rm.category === remarkFilter;
      return true;
    });
    const isManager = user && ['SUPER_ADMIN', 'CAMPAIGN_MANAGER', 'DATA_MANAGER'].includes(user.role);

    const localTz = inferTimezone(company?.timezone, company?.country);
    const clockInfo = getLocalClockSummary(localTz);
    const emailTemplates = templates.filter((t: any) => t.channel === 'EMAIL');
    const callScripts = templates.filter((t: any) => t.channel === 'CALL_SCRIPT');
    const socialTemplates = templates.filter((t: any) => t.channel === quickMsgChannel);
    const activeScript = callScripts.find((s: any) => String(s.id) === selectedScriptId) || callScripts[0];

    return (
      <div className="space-y-5">
        {/* Top Action Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveRecordId(null);
                setWorkspaceDetail(null);
                onClearInitialRecord?.();
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Queue</span>
            </Button>
            {currentQueueIndex >= 0 && (
              <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-0.5 bg-white dark:bg-slate-900">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5"
                  disabled={!prevRecordId}
                  onClick={() => prevRecordId && setActiveRecordId(prevRecordId)}
                  title="Previous prospect in queue"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums px-1">
                  {currentQueueIndex + 1} / {records.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5"
                  disabled={!nextRecordId}
                  onClick={() => nextRecordId && setActiveRecordId(nextRecordId)}
                  title="Next prospect in queue"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">{company?.name}</h1>
                <StatusLabel status={record.status} />
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono ${
                    clockInfo.inWindow
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  {clockInfo.timeStr} ({localTz.split('/')[1]?.replace(/_/g, ' ') || localTz}) ·{' '}
                  {clockInfo.inWindow ? 'Good Call Window' : 'Outside 8am-6pm'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Campaign: {campaign?.name} · {company?.industry || 'Industry N/A'} · {company?.country || 'Country N/A'} · AI {company?.aiScore}/100 · Fit {company?.fitScore}/100
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCompanyEditForm({
                  name: company?.name || '',
                  website: company?.website || '',
                  domain: company?.domain || '',
                  industry: company?.industry || '',
                  employeeSize: company?.employeeSize || '',
                  country: company?.country || '',
                  revenue: company?.revenue || '',
                  timezone: localTz,
                  description: company?.description || '',
                  customFields: company?.customFields || {},
                });
                setEditCompanyOpen(true);
              }}
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit Company
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFlagForm((f) => ({ ...f, contactId: selectedContact ? String(selectedContact.id) : '' }));
                setFlagOpen(true);
              }}
            >
              <Flag className="h-3.5 w-3.5" /> Flag Bad Data
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEmailTo(selectedContact?.workEmail || '');
                setGmailOpen(true);
              }}
            >
              <Mail className="h-3.5 w-3.5" /> Compose Gmail
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDealForm({
                  title: `${company?.name || 'Prospect'} — Opportunity`,
                  stage: 'DISCOVERY',
                  amount: '35000',
                  probability: '25',
                  expectedCloseDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                  notes: summaryDraft || '',
                });
                setDealOpen(true);
              }}
            >
              <DollarSign className="h-3.5 w-3.5" /> Create Deal
            </Button>
            <Button size="sm" onClick={() => setApptOpen(true)}>
              <CalendarPlus className="h-3.5 w-3.5" />
              <span>Schedule Appointment</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Left Column: Company + Contacts + Cadence + Playbook */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Company Details</CardTitle>
                {(company?.domain || company?.website) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-red-600"
                    onClick={() =>
                      setDncConfirm({
                        type: 'DOMAIN',
                        value: company.domain || company.website,
                        label: `Suppress entire domain (${company.domain || company.website})`,
                      })
                    }
                  >
                    <ShieldBan className="h-3.5 w-3.5" /> Suppress Domain
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <div className="flex flex-wrap gap-2">
                  {safeExternalUrl(company?.website) && (
                    <a
                      href={safeExternalUrl(company.website)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open Website
                    </a>
                  )}
                  {safeExternalUrl(company?.linkedinUrl) && (
                    <a
                      href={safeExternalUrl(company.linkedinUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Company LinkedIn
                    </a>
                  )}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1 pt-1">
                  <div><span className="text-slate-400">Domain:</span> <span className="font-mono">{company?.domain || '—'}</span></div>
                  <div><span className="text-slate-400">Employees:</span> {company?.employeeSize || '—'}</div>
                  <div><span className="text-slate-400">Revenue:</span> {company?.revenue || '—'}</div>
                  <div><span className="text-slate-400">Timezone:</span> <span className="font-mono">{localTz}</span></div>
                  <div><span className="text-slate-400">Description:</span> {company?.description || '—'}</div>
                  {company?.customFields && Object.keys(company.customFields).length > 0 && (
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                      {Object.entries(company.customFields).map(([k, v]) => (
                        <div key={k}><span className="text-slate-400">{k}:</span> {String(v)}</div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Decision Makers ({compContacts.length})</CardTitle></CardHeader>
              <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
                {compContacts.length === 0 ? (
                  <div className="p-4 text-xs text-slate-500">No contacts linked to this company yet.</div>
                ) : (
                  compContacts.map((ct: any) => (
                    <div key={ct.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{ct.fullName}</span>
                            {ct.doNotContact && (
                              <span className="px-1.5 py-0.5 rounded border border-red-300 bg-red-50 text-red-700 text-[10px] font-semibold">
                                DNC
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{ct.jobTitle || 'Title N/A'} · {ct.department || ct.seniority || '—'}</div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditContact({ ...ct })}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 space-y-0.5">
                        <div>{ct.workEmail || 'No work email'}</div>
                        <div>{ct.phone || 'No direct phone'}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {ct.phone && !ct.doNotContact && (
                          <button
                            type="button"
                            onClick={() => {
                              setActForm((f) => ({ ...f, contactId: String(ct.id), channel: 'PHONE_CALL' }));
                              setCallSeconds(0);
                              setCallRunning(true);
                              window.location.href = `tel:${ct.phone}`;
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Phone className="h-3 w-3" /> Dial &amp; Time
                          </button>
                        )}
                        {ct.workEmail && !ct.doNotContact && (
                          <button
                            type="button"
                            onClick={() => {
                              setActForm((f) => ({ ...f, contactId: String(ct.id), channel: 'EMAIL' }));
                              setEmailTo(ct.workEmail);
                              setGmailOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          >
                            <Mail className="h-3 w-3" /> Gmail
                          </button>
                        )}
                        {ct.phone && !ct.doNotContact && (
                          <a
                            href={`https://wa.me/${ct.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <MessageSquare className="h-3 w-3" /> WhatsApp
                          </a>
                        )}
                        {safeExternalUrl(ct.linkedinUrl) && (
                          <a
                            href={safeExternalUrl(ct.linkedinUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-3 w-3" /> LinkedIn
                          </a>
                        )}
                        {ct.workEmail && !ct.doNotContact && (
                          <button
                            type="button"
                            onClick={() =>
                              setDncConfirm({
                                type: 'EMAIL',
                                value: ct.workEmail,
                                label: `Mark ${ct.fullName} (${ct.workEmail}) as Global Do-Not-Contact`,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 hover:bg-red-50 cursor-pointer"
                          >
                            <ShieldBan className="h-3 w-3" /> DNC
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Automated Multi-Touch Cadence Sequences */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><GitBranch className="h-4 w-4 text-blue-700" /> Cadence Sequences</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-xs">
                {sequenceEnrollments.length > 0 && (
                  <div className="space-y-2">
                    {sequenceEnrollments.map((enr: any) => (
                      <div key={enr.id} className="p-2.5 rounded border border-slate-200 dark:border-slate-800 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{enr.sequenceName}</span>
                          <StatusLabel status={enr.status} />
                        </div>
                        <div className="font-mono text-slate-500">
                          Step {enr.currentStepOrder} / {enr.steps?.length || 1} · Next due: {enr.nextDueDate || '—'}
                        </div>
                        {enr.status === 'ACTIVE' && (
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSequenceAction(enr.id, 'ADVANCE')}>
                              <StepForward className="h-3 w-3" /> Next Step
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSequenceAction(enr.id, 'PAUSE')}>
                              <Pause className="h-3 w-3" /> Pause
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => handleSequenceAction(enr.id, 'STOP')}>
                              <Square className="h-3 w-3" /> Stop
                            </Button>
                          </div>
                        )}
                        {enr.status === 'PAUSED' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleSequenceAction(enr.id, 'RESUME')}>
                            <Play className="h-3 w-3" /> Resume Cadence
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {availableSequences.length > 0 && (
                  <div className="flex items-center gap-2">
                    <SelectField className="h-8 text-xs flex-1" value={enrollSeqId} onChange={(e) => setEnrollSeqId(e.target.value)}>
                      {availableSequences.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name} ({s.steps?.length || 0} steps)</option>
                      ))}
                    </SelectField>
                    <Button size="sm" onClick={handleEnrollSequence}>Enroll</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Campaign Playbook &amp; Flags</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
                <p className="whitespace-pre-line">{campaign?.instructions || 'Follow standard outreach guidelines.'}</p>
                {Array.isArray(campaign?.qualificationQuestions) && campaign.qualificationQuestions.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Qualification Questions</div>
                    <ul className="list-disc pl-4 space-y-1">
                      {campaign.qualificationQuestions.map((q: string, i: number) => <li key={i}>{q}</li>)}
                    </ul>
                  </div>
                )}
                {recordAppts.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">Booked Appointments</div>
                    {recordAppts.map((ap: any) => (
                      <div key={ap.id} className="flex items-center justify-between gap-2 p-2 rounded bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <span className="font-mono">{ap.appointmentDate} {ap.appointmentTime}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[11px]"
                          onClick={() => downloadAppointmentIcs({ ...ap, companyName: company?.name })}
                        >
                          .ics
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {dataFlags.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-slate-200">Data Quality Flags ({dataFlags.length})</div>
                    {dataFlags.map((fl: any) => (
                      <div key={fl.id} className="flex items-center justify-between">
                        <span>{formatCodeLabel(fl.issueType)}</span>
                        <StatusLabel status={fl.status} />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right 2 Columns: Prospect Summary & Remarks + Dialer + Quick Message + Activity Logger + Timeline */}
          <div className="lg:col-span-2 space-y-4">
            {/* Prospect Understanding & Remarks */}
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3">
                <CardTitle className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-blue-700" />
                  <span>Prospect Understanding &amp; Sales Remarks ({remarks.length})</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Account Temperature:</span>
                  <SelectField
                    className="h-8 text-xs w-40"
                    value={sentimentDraft}
                    onChange={(e) => setSentimentDraft(e.target.value)}
                  >
                    {SENTIMENT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </SelectField>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Executive Summary / Current Prospect Brief */}
                <div className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Current Prospect Brief (So the team immediately understands this account)
                    </Label>
                    {sentimentDraft && (
                      <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${getSentimentStyle(sentimentDraft)}`}>
                        {SENTIMENT_OPTIONS.find((s) => s.value === sentimentDraft)?.label || sentimentDraft}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-start">
                    <Textarea
                      rows={2}
                      className="flex-1 text-xs bg-white dark:bg-slate-950"
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      placeholder="Summarize who the buyer is, what they currently use, main pain points, budget/timeline, and current angle..."
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleSaveSummary}
                      disabled={savingSummary}
                      className="shrink-0"
                    >
                      <Save className="h-3.5 w-3.5" />
                      <span>{savingSummary ? 'Saving...' : 'Save Brief'}</span>
                    </Button>
                  </div>
                </div>

                {/* Add Remark Form */}
                <form onSubmit={handleAddRemark} className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <Label className="text-xs">Remark Category</Label>
                      <SelectField
                        className="h-8 text-xs"
                        value={remarkForm.category}
                        onChange={(e) => setRemarkForm((f) => ({ ...f, category: e.target.value }))}
                      >
                        {REMARK_CATEGORIES.map((cat) => (
                          <option key={cat.value} value={cat.value}>{cat.label}</option>
                        ))}
                      </SelectField>
                    </div>
                    <div>
                      <Label className="text-xs">Related Contact (optional)</Label>
                      <SelectField
                        className="h-8 text-xs"
                        value={remarkForm.contactId}
                        onChange={(e) => setRemarkForm((f) => ({ ...f, contactId: e.target.value }))}
                      >
                        <option value="">Company-wide remark</option>
                        {compContacts.map((ct: any) => (
                          <option key={ct.id} value={ct.id}>{ct.fullName}</option>
                        ))}
                      </SelectField>
                    </div>
                    <div className="flex items-end pb-1">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={remarkForm.isPinned}
                          onChange={(e) => setRemarkForm((f) => ({ ...f, isPinned: e.target.checked }))}
                        />
                        <Pin className="h-3.5 w-3.5 text-amber-600" />
                        <span>Pin important remark</span>
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 items-start">
                    <Textarea
                      rows={2}
                      className="flex-1 text-xs"
                      value={remarkForm.content}
                      onChange={(e) => setRemarkForm((f) => ({ ...f, content: e.target.value }))}
                      placeholder="Add a standalone remark about this prospect (objections, org politics, tools used, preferences, handover notes)..."
                    />
                    <Button type="submit" size="sm" disabled={savingRemark || !remarkForm.content.trim()} className="shrink-0">
                      <StickyNote className="h-3.5 w-3.5" />
                      <span>{savingRemark ? 'Saving...' : 'Add Remark'}</span>
                    </Button>
                  </div>
                </form>

                {/* Filter & Remarks Feed */}
                <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setRemarkFilter('ALL')}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                          remarkFilter === 'ALL'
                            ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        All ({remarks.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemarkFilter('PINNED')}
                        className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                          remarkFilter === 'PINNED'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Pinned ({remarks.filter((rm: any) => rm.isPinned).length})
                      </button>
                      {REMARK_CATEGORIES.filter((c) => remarks.some((rm: any) => rm.category === c.value)).map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => setRemarkFilter(c.value)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer ${
                            remarkFilter === c.value
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredRemarks.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">
                      No remarks recorded yet for this filter. Add notes above so your team understands everything about this prospect.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {filteredRemarks.map((rm: any) => {
                        const canModify = isManager || rm.authorId === user?.id;
                        const isEditing = editingRemarkId === rm.id;
                        return (
                          <div
                            key={rm.id}
                            className={`p-3 rounded-md border text-xs space-y-1.5 ${
                              rm.isPinned
                                ? 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {rm.isPinned && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300 text-[10px] font-semibold">
                                    <Pin className="h-2.5 w-2.5" /> PINNED
                                  </span>
                                )}
                                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getRemarkCategoryStyle(rm.category)}`}>
                                  {getRemarkCategoryLabel(rm.category)}
                                </span>
                                {rm.contactName && (
                                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                    · Re: {rm.contactName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                                  {rm.authorName} ({formatCodeLabel(rm.authorRole)}) · {new Date(rm.createdAt).toLocaleString()}
                                </span>
                                {canModify && !isEditing && (
                                  <>
                                    <button
                                      type="button"
                                      title={rm.isPinned ? 'Unpin remark' : 'Pin remark'}
                                      onClick={() => handleTogglePinRemark(rm)}
                                      className="p-1 text-slate-400 hover:text-amber-600 cursor-pointer"
                                    >
                                      {rm.isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                                    </button>
                                    <button
                                      type="button"
                                      title="Edit remark"
                                      onClick={() => {
                                        setEditingRemarkId(rm.id);
                                        setEditingRemarkDraft({
                                          category: rm.category,
                                          content: rm.content,
                                          isPinned: Boolean(rm.isPinned),
                                        });
                                      }}
                                      className="p-1 text-slate-400 hover:text-blue-700 cursor-pointer"
                                    >
                                      <Edit3 className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete remark"
                                      onClick={() => handleDeleteRemark(rm.id)}
                                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {isEditing ? (
                              <div className="space-y-2 pt-1">
                                <div className="flex flex-wrap gap-2 items-center">
                                  <SelectField
                                    className="h-7 text-xs w-48"
                                    value={editingRemarkDraft.category}
                                    onChange={(e) => setEditingRemarkDraft((d) => ({ ...d, category: e.target.value }))}
                                  >
                                    {REMARK_CATEGORIES.map((cat) => (
                                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                                    ))}
                                  </SelectField>
                                  <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editingRemarkDraft.isPinned}
                                      onChange={(e) => setEditingRemarkDraft((d) => ({ ...d, isPinned: e.target.checked }))}
                                    />
                                    <span>Pinned</span>
                                  </label>
                                </div>
                                <Textarea
                                  rows={2}
                                  className="text-xs"
                                  value={editingRemarkDraft.content}
                                  onChange={(e) => setEditingRemarkDraft((d) => ({ ...d, content: e.target.value }))}
                                />
                                <div className="flex justify-end gap-2">
                                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingRemarkId(null)}>
                                    Cancel
                                  </Button>
                                  <Button type="button" size="sm" onClick={() => handleSaveEditRemark(rm.id)}>
                                    Save Changes
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-line">{rm.content}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Click-to-Call Dialer, Timer & Script */}
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-blue-700" />
                  <span>Call Dialer, Timer &amp; Script</span>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-semibold tabular-nums px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    {formatDuration(callSeconds)}
                  </span>
                  {!callRunning ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActForm((f) => ({ ...f, channel: 'PHONE_CALL' }));
                        setCallRunning(true);
                      }}
                    >
                      <Play className="h-3.5 w-3.5" /> Start Timer
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setCallRunning(false);
                        setActForm((f) => ({ ...f, channel: 'PHONE_CALL', durationSeconds: String(callSeconds) }));
                        toast.info(`Call timer captured (${formatDuration(callSeconds)}) into activity form.`);
                      }}
                    >
                      <Square className="h-3.5 w-3.5 text-red-600" /> Stop &amp; Capture
                    </Button>
                  )}
                </div>
              </CardHeader>
              {callScripts.length > 0 && (
                <CardContent className="pt-0 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Label className="mb-0 shrink-0">Call Script:</Label>
                    <SelectField className="h-8 text-xs" value={selectedScriptId} onChange={(e) => setSelectedScriptId(e.target.value)}>
                      {callScripts.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </SelectField>
                  </div>
                  {activeScript && (
                    <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 whitespace-pre-line text-slate-700 dark:text-slate-300">
                      {renderMergeTags(activeScript.body, mergeCtx)}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Quick Social / WhatsApp Template Copier & Gmail History */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">LinkedIn / WhatsApp Quick Message</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  <div className="flex gap-2">
                    <SelectField
                      className="h-8 text-xs"
                      value={quickMsgChannel}
                      onChange={(e) => setQuickMsgChannel(e.target.value as any)}
                    >
                      <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
                      <option value="WHATSAPP">WhatsApp</option>
                    </SelectField>
                    <SelectField
                      className="h-8 text-xs"
                      value=""
                      onChange={(e) => {
                        const tpl = socialTemplates.find((t: any) => String(t.id) === e.target.value);
                        if (tpl) setQuickMsgText(renderMergeTags(tpl.body, mergeCtx));
                      }}
                    >
                      <option value="">Load template...</option>
                      {socialTemplates.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </SelectField>
                  </div>
                  <Textarea
                    rows={3}
                    value={quickMsgText}
                    onChange={(e) => setQuickMsgText(e.target.value)}
                    placeholder="Select a template or type outreach message to copy..."
                  />
                  <div className="flex justify-between items-center">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => {
                        if (!quickMsgText) return;
                        navigator.clipboard.writeText(quickMsgText);
                        setActForm((f) => ({ ...f, channel: quickMsgChannel, notes: quickMsgText }));
                        toast.success('Copied message & populated activity notes.');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy &amp; Prefill Log
                    </Button>
                    {selectedContact?.phone && quickMsgChannel === 'WHATSAPP' && (
                      <a
                        href={`https://wa.me/${selectedContact.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(quickMsgText)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-700 font-medium hover:underline"
                      >
                        Open WhatsApp <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm">Gmail Thread History</CardTitle>
                  <Button size="sm" variant="outline" onClick={handleLoadGmailThreads} disabled={loadingThreads}>
                    <RefreshCw className={`h-3.5 w-3.5 ${loadingThreads ? 'animate-spin' : ''}`} />
                    <span>{googleAccessToken ? 'Sync Threads' : 'Connect Gmail'}</span>
                  </Button>
                </CardHeader>
                <CardContent className="text-xs space-y-2 max-h-40 overflow-y-auto">
                  {gmailThreads.length === 0 ? (
                    <p className="text-slate-500">
                      Click Sync Threads to inspect recent Gmail conversations with {selectedContact?.workEmail || 'this contact'}.
                    </p>
                  ) : (
                    gmailThreads.map((th) => (
                      <div key={th.id} className="p-2 rounded border border-slate-100 dark:border-slate-800">
                        <div className="font-semibold truncate">{th.subject}</div>
                        <div className="text-[11px] text-slate-400 truncate">{th.from} · {th.date}</div>
                        <div className="text-slate-600 dark:text-slate-300 line-clamp-2 mt-0.5">{th.snippet}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Activity Logger */}
            <Card>
              <CardHeader>
                <CardTitle>Record Outreach Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogActivity} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Contact</Label>
                      <SelectField value={actForm.contactId} onChange={(e) => setActForm({ ...actForm, contactId: e.target.value })}>
                        <option value="">Company-level touchpoint</option>
                        {compContacts.map((ct: any) => (
                          <option key={ct.id} value={ct.id}>{ct.fullName} ({ct.jobTitle || 'Contact'})</option>
                        ))}
                      </SelectField>
                    </div>
                    <div>
                      <Label>Outreach Channel *</Label>
                      <SelectField value={actForm.channel} onChange={(e) => setActForm({ ...actForm, channel: e.target.value })}>
                        <option value="PHONE_CALL">Phone Call</option>
                        <option value="LINKEDIN_CONNECTION">LinkedIn Connection Request</option>
                        <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
                        <option value="EMAIL">Email</option>
                        <option value="WHATSAPP">WhatsApp</option>
                        <option value="OTHER">Other</option>
                      </SelectField>
                    </div>
                    <div>
                      <Label>Activity Outcome *</Label>
                      <SelectField value={actForm.outcome} onChange={(e) => setActForm({ ...actForm, outcome: e.target.value })}>
                        {outcomeRules.map((r) => (
                          <option key={r.outcome} value={r.outcome}>{r.label}</option>
                        ))}
                      </SelectField>
                    </div>
                  </div>

                  {selectedOutcomeRule && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
                      <span>Resulting status update:</span>
                      <StatusLabel status={selectedOutcomeRule.resultingStatus} />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Prospect Response Category</Label>
                      <SelectField
                        value={actForm.responseCategory}
                        onChange={(e) => setActForm({ ...actForm, responseCategory: e.target.value })}
                      >
                        {RESPONSE_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </SelectField>
                    </div>
                    <div>
                      <Label>Activity Date</Label>
                      <Input type="date" value={actForm.activityDate} onChange={(e) => setActForm({ ...actForm, activityDate: e.target.value })} />
                    </div>
                    <div>
                      <Label>Activity Time</Label>
                      <Input type="time" value={actForm.activityTime} onChange={(e) => setActForm({ ...actForm, activityTime: e.target.value })} />
                    </div>
                  </div>

                  {actForm.channel === 'PHONE_CALL' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Call Duration (seconds)</Label>
                        <Input
                          type="number"
                          min={0}
                          placeholder={callSeconds > 0 ? String(callSeconds) : 'e.g. 180'}
                          value={actForm.durationSeconds}
                          onChange={(e) => setActForm({ ...actForm, durationSeconds: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Call Recording URL (optional)</Label>
                        <Input
                          placeholder="https://recordings.example.com/..."
                          value={actForm.recordingUrl}
                          onChange={(e) => setActForm({ ...actForm, recordingUrl: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Conversation Notes &amp; Remarks</Label>
                    <Textarea
                      rows={3}
                      value={actForm.notes}
                      onChange={(e) => setActForm({ ...actForm, notes: e.target.value })}
                      placeholder="Record what the prospect said, objections, qualification details, or next steps..."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <Label>Schedule Follow-up Date (optional)</Label>
                      <Input type="date" value={actForm.followUpDate} onChange={(e) => setActForm({ ...actForm, followUpDate: e.target.value })} />
                    </div>
                    <div>
                      <Label>Follow-up Time</Label>
                      <Input type="time" value={actForm.followUpTime} onChange={(e) => setActForm({ ...actForm, followUpTime: e.target.value })} />
                    </div>
                    <div>
                      <Label>Follow-up Channel</Label>
                      <SelectField value={actForm.followUpType} onChange={(e) => setActForm({ ...actForm, followUpType: e.target.value })}>
                        <option value="CALL">Call</option>
                        <option value="EMAIL">Email</option>
                        <option value="LINKEDIN_MESSAGE">LinkedIn Message</option>
                        <option value="WHATSAPP">WhatsApp</option>
                      </SelectField>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="submit" variant="outline" disabled={submitting}>
                      <Send className="h-4 w-4" />
                      <span>{submitting ? 'Logging Activity...' : 'Log Activity & Update Status'}</span>
                    </Button>
                    <Button
                      type="button"
                      disabled={submitting}
                      onClick={(e) => handleLogActivity(e, true)}
                    >
                      <StepForward className="h-4 w-4" />
                      <span>{submitting ? 'Logging...' : 'Log & Next Prospect'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Permanent Activity Timeline ({timeline.length})</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-slate-100 dark:divide-slate-800 p-0">
                {timeline.length === 0 ? (
                  <div className="p-6 text-sm text-slate-500 text-center">No outreach activities logged yet.</div>
                ) : (
                  timeline.map((a: any) => (
                    <div key={a.id} className="p-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span>{formatCodeLabel(a.channel)}</span>
                          <span className="text-slate-400">·</span>
                          <StatusLabel status={a.resultingStatus} />
                          {a.durationSeconds ? (
                            <span className="font-mono text-xs text-slate-500">({formatDuration(a.durationSeconds)})</span>
                          ) : null}
                        </div>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {a.activityDate} {a.activityTime} · {a.createdByName}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {a.contactName ? `Contact: ${a.contactName} · ` : ''}
                        {a.responseCategory ? `Response: ${formatCodeLabel(a.responseCategory)}` : ''}
                        {a.emailSubject ? ` · Subject: ${a.emailSubject}` : ''}
                      </div>
                      {a.notes && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{a.notes}</p>}
                      {safeExternalUrl(a.recordingUrl) && (
                        <a href={safeExternalUrl(a.recordingUrl)!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
                          <ExternalLink className="h-3 w-3" /> Play Call Recording
                        </a>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Compose Gmail Modal */}
        <Dialog open={gmailOpen} onOpenChange={setGmailOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Compose Email via Google Workspace Gmail</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              {!googleAccessToken && (
                <div className="p-3 rounded-md border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/30 flex items-center justify-between gap-3 text-xs">
                  <span>Connect your Google Workspace account to send emails directly from Gmail.</span>
                  <Button size="sm" variant="outline" onClick={() => connectGoogleWorkspace()}>Connect Gmail</Button>
                </div>
              )}
              <div>
                <Label>Load Email Template</Label>
                <SelectField
                  value={selectedEmailTemplateId}
                  onChange={(e) => {
                    setSelectedEmailTemplateId(e.target.value);
                    const tpl = emailTemplates.find((t: any) => String(t.id) === e.target.value);
                    if (tpl) {
                      setEmailSubject(renderMergeTags(tpl.subject || '', mergeCtx));
                      setEmailBody(renderMergeTags(tpl.body, mergeCtx));
                    }
                  }}
                >
                  <option value="">Select template...</option>
                  {emailTemplates.map((t: any) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </SelectField>
              </div>
              <div>
                <Label>To *</Label>
                <Input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="prospect@company.com" required />
              </div>
              <div>
                <Label>Subject *</Label>
                <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Quick intro..." required />
              </div>
              <div>
                <Label>Message *</Label>
                <Textarea rows={6} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} required />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setGmailOpen(false)}>Cancel</Button>
                <Button
                  type="button"
                  disabled={!emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}
                  onClick={() => setGmailConfirmOpen(true)}
                >
                  Review &amp; Send
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* MANDATORY Gmail Confirmation Dialog */}
        <Dialog open={gmailConfirmOpen} onOpenChange={setGmailConfirmOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm Sending Email via Gmail</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm mt-2">
              <p className="text-slate-600 dark:text-slate-300">
                Please confirm you want to send this live email from your connected Google Gmail account and log it to the prospect timeline:
              </p>
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div><span className="text-slate-400">Recipient:</span> <span className="font-mono font-medium">{emailTo}</span></div>
                <div><span className="text-slate-400">Subject:</span> <span className="font-medium">{emailSubject}</span></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setGmailConfirmOpen(false)} disabled={sendingGmail}>Cancel</Button>
                <Button onClick={handleConfirmedSendGmail} disabled={sendingGmail}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{sendingGmail ? 'Sending...' : 'Confirm & Send Email'}</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Appointment Modal */}
        <Dialog open={apptOpen} onOpenChange={setApptOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Schedule Appointment — {company?.name}</DialogTitle></DialogHeader>
            <form onSubmit={openBookAppointmentFlow} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Prospect Name *</Label>
                  <Input value={apptForm.prospectName} onChange={(e) => setApptForm({ ...apptForm, prospectName: e.target.value })} required />
                </div>
                <div>
                  <Label>Job Title</Label>
                  <Input value={apptForm.prospectTitle} onChange={(e) => setApptForm({ ...apptForm, prospectTitle: e.target.value })} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" value={apptForm.prospectEmail} onChange={(e) => setApptForm({ ...apptForm, prospectEmail: e.target.value })} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={apptForm.prospectPhone} onChange={(e) => setApptForm({ ...apptForm, prospectPhone: e.target.value })} />
                </div>
                <div>
                  <Label>Appointment Date *</Label>
                  <Input type="date" value={apptForm.appointmentDate} onChange={(e) => setApptForm({ ...apptForm, appointmentDate: e.target.value })} required />
                </div>
                <div>
                  <Label>Appointment Time *</Label>
                  <Input type="time" value={apptForm.appointmentTime} onChange={(e) => setApptForm({ ...apptForm, appointmentTime: e.target.value })} required />
                </div>
                <div>
                  <Label>Timezone</Label>
                  <SelectField value={apptForm.timezone} onChange={(e) => setApptForm({ ...apptForm, timezone: e.target.value })}>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </SelectField>
                </div>
                <div>
                  <Label>Meeting Type</Label>
                  <SelectField value={apptForm.meetingType} onChange={(e) => setApptForm({ ...apptForm, meetingType: e.target.value })}>
                    <option value="Video Call">Video Call</option>
                    <option value="Phone Call">Phone Call</option>
                    <option value="In-Person">In-Person</option>
                  </SelectField>
                </div>
              </div>
              <div>
                <Label>Meeting Link / Location (leave blank to auto-generate Google Meet)</Label>
                <Input value={apptForm.meetingLink} onChange={(e) => setApptForm({ ...apptForm, meetingLink: e.target.value })} placeholder="https://meet..." />
              </div>
              <div>
                <Label>Prospect Requirements &amp; Meeting Notes</Label>
                <Textarea value={apptForm.requirements} onChange={(e) => setApptForm({ ...apptForm, requirements: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input type="checkbox" checked={apptSyncCalendar} onChange={(e) => setApptSyncCalendar(e.target.checked)} />
                <span>Sync to Google Calendar &amp; send Google Meet calendar invite</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setApptOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Booking...' : 'Continue'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* MANDATORY Google Calendar Confirmation Modal */}
        <Dialog open={apptCalendarConfirmOpen} onOpenChange={setApptCalendarConfirmOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm Google Calendar Event Creation</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm mt-2">
              <p className="text-slate-600 dark:text-slate-300">
                Confirm creating this calendar event on your Google Calendar and inviting the attendee:
              </p>
              <div className="p-3 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div><span className="text-slate-400">Event:</span> Discovery Call — {company?.name || apptForm.prospectName}</div>
                <div><span className="text-slate-400">Date &amp; Time:</span> <span className="font-mono">{apptForm.appointmentDate} {apptForm.appointmentTime} ({apptForm.timezone})</span></div>
                <div><span className="text-slate-400">Attendee:</span> <span className="font-mono">{apptForm.prospectEmail || 'No email specified (calendar event only)'}</span></div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => finalizeBookAppointment(false)} disabled={submitting}>
                  Save Locally Only
                </Button>
                <Button onClick={() => finalizeBookAppointment(true)} disabled={submitting}>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{submitting ? 'Syncing...' : 'Confirm & Create Calendar Invite'}</span>
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Company Modal */}
        <Dialog open={editCompanyOpen} onOpenChange={setEditCompanyOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Company Details</DialogTitle></DialogHeader>
            <form onSubmit={handleSaveCompanyEdit} className="space-y-3 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><Label>Name *</Label><Input value={companyEditForm.name || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, name: e.target.value })} required /></div>
                <div><Label>Website</Label><Input value={companyEditForm.website || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, website: e.target.value })} /></div>
                <div><Label>Domain</Label><Input value={companyEditForm.domain || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, domain: e.target.value })} /></div>
                <div><Label>Industry</Label><Input value={companyEditForm.industry || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, industry: e.target.value })} /></div>
                <div><Label>Employees</Label><Input value={companyEditForm.employeeSize || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, employeeSize: e.target.value })} /></div>
                <div><Label>Country</Label><Input value={companyEditForm.country || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, country: e.target.value })} /></div>
                <div><Label>Revenue</Label><Input value={companyEditForm.revenue || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, revenue: e.target.value })} /></div>
                <div>
                  <Label>Timezone</Label>
                  <SelectField value={companyEditForm.timezone || 'America/New_York'} onChange={(e) => setCompanyEditForm({ ...companyEditForm, timezone: e.target.value })}>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </SelectField>
                </div>
              </div>
              <div><Label>Description</Label><Textarea value={companyEditForm.description || ''} onChange={(e) => setCompanyEditForm({ ...companyEditForm, description: e.target.value })} /></div>
              {customFieldKeys.length > 0 && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">Custom Company Fields</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {customFieldKeys.map((fieldKey) => (
                      <div key={fieldKey}>
                        <Label>{fieldKey}</Label>
                        <Input
                          value={companyEditForm.customFields?.[fieldKey] || ''}
                          onChange={(e) =>
                            setCompanyEditForm({
                              ...companyEditForm,
                              customFields: { ...(companyEditForm.customFields || {}), [fieldKey]: e.target.value },
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditCompanyOpen(false)}>Cancel</Button>
                <Button type="submit">Save Company</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Contact Modal */}
        <Dialog open={Boolean(editContact)} onOpenChange={(o) => !o && setEditContact(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Contact — {editContact?.fullName}</DialogTitle></DialogHeader>
            {editContact && (
              <form onSubmit={handleSaveContactEdit} className="space-y-3 mt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Full Name *</Label><Input value={editContact.fullName || ''} onChange={(e) => setEditContact({ ...editContact, fullName: e.target.value })} required /></div>
                  <div><Label>Job Title</Label><Input value={editContact.jobTitle || ''} onChange={(e) => setEditContact({ ...editContact, jobTitle: e.target.value })} /></div>
                  <div><Label>Work Email</Label><Input type="email" value={editContact.workEmail || ''} onChange={(e) => setEditContact({ ...editContact, workEmail: e.target.value })} /></div>
                  <div><Label>Direct Phone</Label><Input value={editContact.phone || ''} onChange={(e) => setEditContact({ ...editContact, phone: e.target.value })} /></div>
                  <div><Label>Department</Label><Input value={editContact.department || ''} onChange={(e) => setEditContact({ ...editContact, department: e.target.value })} /></div>
                  <div><Label>Seniority</Label><Input value={editContact.seniority || ''} onChange={(e) => setEditContact({ ...editContact, seniority: e.target.value })} /></div>
                </div>
                <div><Label>LinkedIn URL</Label><Input value={editContact.linkedinUrl || ''} onChange={(e) => setEditContact({ ...editContact, linkedinUrl: e.target.value })} /></div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditContact(null)}>Cancel</Button>
                  <Button type="submit">Save Contact</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Flag Bad Data Modal */}
        <Dialog open={flagOpen} onOpenChange={setFlagOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Flag Data Quality / Enrichment Request</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateFlag} className="space-y-3 mt-2">
              <div>
                <Label>Related Contact (optional)</Label>
                <SelectField value={flagForm.contactId} onChange={(e) => setFlagForm({ ...flagForm, contactId: e.target.value })}>
                  <option value="">Company-level issue</option>
                  {compContacts.map((ct: any) => <option key={ct.id} value={ct.id}>{ct.fullName}</option>)}
                </SelectField>
              </div>
              <div>
                <Label>Issue Type *</Label>
                <SelectField value={flagForm.issueType} onChange={(e) => setFlagForm({ ...flagForm, issueType: e.target.value })}>
                  <option value="BOUNCED_EMAIL">Bounced / Invalid Email</option>
                  <option value="WRONG_NUMBER">Wrong / Disconnected Phone</option>
                  <option value="LEFT_COMPANY">Contact Left Company</option>
                  <option value="NEEDS_ENRICHMENT">Needs Contact / Phone Enrichment</option>
                  <option value="DUPLICATE_RECORD">Duplicate Company / Contact</option>
                </SelectField>
              </div>
              <div>
                <Label>Proposed Fix / Replacement Info</Label>
                <Input value={flagForm.proposedFix} onChange={(e) => setFlagForm({ ...flagForm, proposedFix: e.target.value })} placeholder="e.g. New VP Eng is..." />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={flagForm.notes} onChange={(e) => setFlagForm({ ...flagForm, notes: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setFlagOpen(false)}>Cancel</Button>
                <Button type="submit">Submit Flag to Data Team</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Confirm Global DNC */}
        <Dialog open={Boolean(dncConfirm)} onOpenChange={(o) => !o && setDncConfirm(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Confirm Global Do-Not-Contact Suppression</DialogTitle></DialogHeader>
            {dncConfirm && (
              <div className="space-y-3 text-sm mt-2">
                <p className="text-slate-600 dark:text-slate-300">{dncConfirm.label}</p>
                <p className="text-xs text-slate-500">
                  This blocks future imports and outreach to <span className="font-mono">{dncConfirm.value}</span> across all campaigns.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDncConfirm(null)}>Cancel</Button>
                  <Button onClick={handleConfirmDnc}>Add to Global DNC</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Create Deal Modal */}
        <Dialog open={dealOpen} onOpenChange={setDealOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Pipeline Deal — {company?.name}</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateDeal} className="space-y-3 mt-2">
              <div>
                <Label>Deal Title *</Label>
                <Input
                  value={dealForm.title}
                  onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Stage</Label>
                  <SelectField
                    value={dealForm.stage}
                    onChange={(e) => {
                      const stageMeta = DEAL_STAGES.find((s) => s.value === e.target.value);
                      setDealForm({
                        ...dealForm,
                        stage: e.target.value,
                        probability: stageMeta ? String(stageMeta.defaultProbability) : dealForm.probability,
                      });
                    }}
                  >
                    {DEAL_STAGES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </SelectField>
                </div>
                <div>
                  <Label>Expected Close Date</Label>
                  <Input
                    type="date"
                    value={dealForm.expectedCloseDate}
                    onChange={(e) => setDealForm({ ...dealForm, expectedCloseDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Amount (USD)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={dealForm.amount}
                    onChange={(e) => setDealForm({ ...dealForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Win Probability (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={dealForm.probability}
                    onChange={(e) => setDealForm({ ...dealForm, probability: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Commercial Notes</Label>
                <Textarea
                  rows={3}
                  value={dealForm.notes}
                  onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })}
                  placeholder="Scope, stakeholders, budget timeline..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setDealOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={savingDeal}>{savingDeal ? 'Creating...' : 'Create Deal'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ==================== PROSPECTING QUEUE LIST ====================
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
          My Prospecting Data Queue
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Select any assigned company to research decision makers, run click-to-call scripts, compose Gmail outreach, manage cadences, or book meetings.
        </p>
      </div>

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md w-fit">
            {PRESET_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setPreset(f.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  preset === f.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                className="pl-9"
                placeholder="Search company, contact name, job title, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <SelectField className="sm:w-64" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">All Assigned Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </SelectField>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4 font-medium">Company</th>
                <th className="py-3 px-4 font-medium">Primary Contact</th>
                <th className="py-3 px-4 font-medium">Campaign</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Prospect Brief &amp; Latest Remark</th>
                <th className="py-3 px-4 font-medium">Last Activity</th>
                <th className="py-3 px-4 font-medium">Next Follow-up</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={8} className="py-8 text-center text-slate-400">Loading assigned records...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={8} className="py-10 text-center text-slate-500">No prospecting records match your filters.</td></tr>
              ) : (
                records.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                    onClick={() => setActiveRecordId(r.id)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 dark:text-white">{r.companyName}</div>
                      <div className="text-xs text-slate-500 font-mono">{r.domain || r.website || '—'}</div>
                    </td>
                    <td className="py-3 px-4">
                      {r.primaryContact ? (
                        <div>
                          <div className="font-medium text-xs">{r.primaryContact.fullName}</div>
                          <div className="text-xs text-slate-500">{r.primaryContact.jobTitle || r.primaryContact.workEmail || '—'}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">No contact</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">{r.campaignName}</td>
                    <td className="py-3 px-4"><StatusLabel status={r.status} /></td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="flex flex-wrap items-center gap-1 mb-0.5">
                        {r.prospectSentiment && (
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${getSentimentStyle(r.prospectSentiment)}`}>
                            {r.prospectSentiment}
                          </span>
                        )}
                        {r.remarksCount > 0 && (
                          <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                            {r.remarksCount} remark{r.remarksCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {r.latestRemark?.content || r.prospectSummary || <span className="text-slate-400">No remarks yet</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">{r.lastActivitySummary || 'Not contacted'}</td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600 dark:text-slate-300">{r.nextFollowUp || '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveRecordId(r.id);
                        }}
                      >
                        Work Record
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
