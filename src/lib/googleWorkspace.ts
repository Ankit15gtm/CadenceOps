export interface MergeTagContext {
  firstName?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  senderName?: string | null;
}

export function renderMergeTags(template: string, ctx: MergeTagContext): string {
  const first =
    ctx.firstName?.trim() ||
    (ctx.fullName ? ctx.fullName.trim().split(/\s+/)[0] : '') ||
    'there';
  return template
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*full_name\s*\}\}/gi, ctx.fullName?.trim() || first)
    .replace(/\{\{\s*company_name\s*\}\}/gi, ctx.companyName?.trim() || 'your team')
    .replace(/\{\{\s*job_title\s*\}\}/gi, ctx.jobTitle?.trim() || 'team')
    .replace(/\{\{\s*sender_name\s*\}\}/gi, ctx.senderName?.trim() || 'Team');
}

function encodeBase64UrlUtf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendGmailEmail(
  accessToken: string,
  params: { to: string; subject: string; body: string }
): Promise<{ id: string; threadId?: string }> {
  const rawMime = [
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    params.body,
  ].join('\r\n');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodeBase64UrlUtf8(rawMime) }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Gmail send failed (${res.status})`);
  }
  return res.json();
}

export interface GmailThreadPreview {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export async function fetchContactGmailThreads(
  accessToken: string,
  contactEmail: string
): Promise<GmailThreadPreview[]> {
  if (!contactEmail.trim()) return [];
  const query = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`);
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=${query}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!listRes.ok) {
    const errBody = await listRes.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Gmail lookup failed (${listRes.status})`);
  }
  const listData = await listRes.json();
  const messages: Array<{ id: string }> = listData.messages || [];

  const previews: GmailThreadPreview[] = [];
  for (const m of messages.slice(0, 5)) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msg = await msgRes.json();
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
    const getHeader = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value || '';
    previews.push({
      id: msg.id,
      subject: getHeader('Subject') || '(No Subject)',
      from: getHeader('From'),
      date: getHeader('Date'),
      snippet: msg.snippet || '',
    });
  }
  return previews;
}

export async function createGoogleCalendarAppointment(
  accessToken: string,
  params: {
    summary: string;
    description: string;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    timeZone: string;
    attendeeEmail?: string | null;
    durationMinutes?: number;
  }
): Promise<{ eventId: string; htmlLink: string; meetLink: string | null }> {
  const startLocal = `${params.date}T${params.time}:00`;
  const startDt = new Date(startLocal);
  const endDt = new Date(startDt.getTime() + (params.durationMinutes || 30) * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const endLocal = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}T${pad(endDt.getHours())}:${pad(endDt.getMinutes())}:00`;

  const payload: Record<string, any> = {
    summary: params.summary,
    description: params.description,
    start: { dateTime: startLocal, timeZone: params.timeZone || 'America/New_York' },
    end: { dateTime: endLocal, timeZone: params.timeZone || 'America/New_York' },
    conferenceData: {
      createRequest: {
        requestId: `cops-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };

  if (params.attendeeEmail && params.attendeeEmail.includes('@')) {
    payload.attendees = [{ email: params.attendeeEmail.trim() }];
  }

  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Google Calendar sync failed (${res.status})`);
  }

  const created = await res.json();
  return {
    eventId: created.id,
    htmlLink: created.htmlLink || '',
    meetLink: created.hangoutLink || created.conferenceData?.entryPoints?.[0]?.uri || null,
  };
}

export function downloadAppointmentIcs(appt: {
  id: number;
  companyName?: string;
  prospectName: string;
  appointmentDate: string;
  appointmentTime: string;
  timezone?: string;
  meetingLink?: string | null;
  notes?: string | null;
}) {
  const cleanDate = appt.appointmentDate.replace(/-/g, '');
  const cleanTime = appt.appointmentTime.replace(/:/g, '').padEnd(6, '0');
  const startParts = appt.appointmentTime.split(':').map(Number);
  const startDateObj = new Date(`${appt.appointmentDate}T${appt.appointmentTime}:00`);
  const endDateObj = new Date(startDateObj.getTime() + 30 * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const endStr = `${endDateObj.getFullYear()}${pad(endDateObj.getMonth() + 1)}${pad(endDateObj.getDate())}T${pad(endDateObj.getHours())}${pad(endDateObj.getMinutes())}00`;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CadenceOps//Appointments//EN',
    'BEGIN:VEVENT',
    `UID:cadenceops-appt-${appt.id}@cadenceops.io`,
    `DTSTAMP:${cleanDate}T${cleanTime}Z`,
    `DTSTART:${cleanDate}T${cleanTime}`,
    `DTEND:${endStr}`,
    `SUMMARY:Discovery Call — ${appt.companyName || appt.prospectName}`,
    `DESCRIPTION:${(appt.notes || '').replace(/\n/g, '\\n')}${appt.meetingLink ? `\\nJoin: ${appt.meetingLink}` : ''}`,
    appt.meetingLink ? `LOCATION:${appt.meetingLink}` : 'LOCATION:Video Call',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  void startParts;

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appointment-${appt.id}-${appt.appointmentDate}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
