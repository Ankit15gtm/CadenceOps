import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CalendarPlus,
  ExternalLink,
  Mail,
  Phone,
  Search,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatCodeLabel, safeExternalUrl } from '../lib/utils.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Button } from '../components/ui/button.tsx';
import { Input, Label, SelectField, Textarea } from '../components/ui/form.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx';
import { StatusLabel } from '../components/StatusLabel.tsx';

const PRESET_FILTERS = [
  { id: '', label: 'All Assigned' },
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

export function ProspectingWorkspacePage({
  initialRecordId,
  onClearInitialRecord,
}: {
  initialRecordId?: number | null;
  onClearInitialRecord?: () => void;
}) {
  const { outcomeRules, refreshProfile } = useAuth();
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
  });

  // Appointment modal
  const [apptOpen, setApptOpen] = useState(false);
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

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (preset) params.set('preset', preset);
      if (campaignId) params.set('campaignId', campaignId);
      if (search) params.set('search', search);
      const [recRes, cmpRes] = await Promise.all([
        apiFetch(`/api/workspace/records?${params.toString()}`),
        apiFetch('/api/campaigns'),
      ]);
      setRecords(recRes.records);
      setCampaigns(cmpRes.campaigns);
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
      const primary = res.contacts?.[0];
      if (primary) {
        setActForm((f) => ({ ...f, contactId: String(primary.id) }));
        setApptForm((f) => ({
          ...f,
          contactId: String(primary.id),
          prospectName: primary.fullName || '',
          prospectTitle: primary.jobTitle || '',
          prospectPhone: primary.phone || '',
          prospectEmail: primary.workEmail || '',
        }));
      }
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
    }
  }, [activeRecordId, loadDetail]);

  const handleLogActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecordId) return;
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
        }),
      });
      toast.success(`Activity logged. Status updated to ${formatCodeLabel(res.resultingStatus)}.`);
      setActForm((f) => ({ ...f, notes: '', followUpDate: '' }));
      await Promise.all([loadDetail(activeRecordId), loadList(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecordId) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/appointments', {
        method: 'POST',
        body: JSON.stringify({
          campaignCompanyRecordId: activeRecordId,
          ...apptForm,
          contactId: apptForm.contactId ? Number(apptForm.contactId) : null,
        }),
      });
      toast.success('Appointment scheduled and status updated.');
      setApptOpen(false);
      await Promise.all([loadDetail(activeRecordId), loadList(), refreshProfile()]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to schedule appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedOutcomeRule = outcomeRules.find((r) => r.outcome === actForm.outcome);

  // ==================== DETAIL WORKSPACE VIEW ====================
  if (activeRecordId) {
    if (detailLoading || !workspaceDetail) {
      return <div className="h-72 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />;
    }

    const { record, company, campaign, contacts: compContacts, activities: timeline } = workspaceDetail;

    return (
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="font-display text-xl font-semibold text-slate-900 dark:text-white">{company?.name}</h1>
                <StatusLabel status={record.status} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Campaign: {campaign?.name} · {company?.industry || 'Industry N/A'} · {company?.country || 'Country N/A'} · AI {company?.aiScore}/100 · Fit {company?.fitScore}/100
              </div>
            </div>
          </div>
          <Button onClick={() => setApptOpen(true)}>
            <CalendarPlus className="h-4 w-4" />
            <span>Schedule Appointment</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Left Column: Company + Contacts + Playbook */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Company Details</CardTitle></CardHeader>
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
                  <div><span className="text-slate-400">Description:</span> {company?.description || '—'}</div>
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
                      <div>
                        <div className="text-sm font-semibold">{ct.fullName}</div>
                        <div className="text-xs text-slate-500">{ct.jobTitle || 'Title N/A'} · {ct.department || ct.seniority || '—'}</div>
                      </div>
                      <div className="text-xs font-mono text-slate-600 dark:text-slate-300 space-y-0.5">
                        <div>{ct.workEmail || 'No work email'}</div>
                        <div>{ct.phone || 'No direct phone'}</div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {ct.phone && (
                          <a
                            href={`tel:${ct.phone}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Phone className="h-3 w-3" /> Call
                          </a>
                        )}
                        {ct.workEmail && (
                          <a
                            href={`mailto:${ct.workEmail}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <Mail className="h-3 w-3" /> Email
                          </a>
                        )}
                        {safeExternalUrl(ct.linkedinUrl) && (
                          <a
                            href={safeExternalUrl(ct.linkedinUrl)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-medium text-blue-700 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="h-3 w-3" /> LinkedIn Profile
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Campaign Instructions</CardTitle></CardHeader>
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
              </CardContent>
            </Card>
          </div>

          {/* Right 2 Columns: Activity Logger + Timeline */}
          <div className="lg:col-span-2 space-y-4">
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

                  <div className="flex justify-end">
                    <Button type="submit" disabled={submitting}>
                      <Send className="h-4 w-4" />
                      <span>{submitting ? 'Logging Activity...' : 'Log Activity & Update Status'}</span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

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
                        </div>
                        <span className="font-mono text-xs text-slate-500 tabular-nums">
                          {a.activityDate} {a.activityTime} · {a.createdByName}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {a.contactName ? `Contact: ${a.contactName} · ` : ''}
                        {a.responseCategory ? `Response: ${formatCodeLabel(a.responseCategory)}` : ''}
                      </div>
                      {a.notes && <p className="text-sm text-slate-700 dark:text-slate-300">{a.notes}</p>}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Appointment Modal */}
        <Dialog open={apptOpen} onOpenChange={setApptOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Schedule Appointment — {company?.name}</DialogTitle></DialogHeader>
            <form onSubmit={handleBookAppointment} className="space-y-3 mt-2">
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
                    <option value="America/New_York">America/New_York (EST/EDT)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT)</option>
                    <option value="Europe/London">Europe/London (GMT/BST)</option>
                    <option value="Europe/Berlin">Europe/Berlin (CET)</option>
                    <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
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
                <Label>Meeting Link / Location</Label>
                <Input value={apptForm.meetingLink} onChange={(e) => setApptForm({ ...apptForm, meetingLink: e.target.value })} placeholder="https://meet..." />
              </div>
              <div>
                <Label>Prospect Requirements &amp; Meeting Notes</Label>
                <Textarea value={apptForm.requirements} onChange={(e) => setApptForm({ ...apptForm, requirements: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setApptOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Booking...' : 'Confirm Appointment'}</Button>
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
          Select any assigned company to research decision makers, log multi-channel outreach, create follow-ups, or book appointments.
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
                <th className="py-3 px-4 font-medium">Last Activity</th>
                <th className="py-3 px-4 font-medium">Next Follow-up</th>
                <th className="py-3 px-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">Loading assigned records...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-slate-500">No prospecting records match your filters.</td></tr>
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
