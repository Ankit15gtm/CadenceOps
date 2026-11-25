import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { appSettings, dncSuppression } from '../db/schema.ts';
import { normalizeDomain, normalizeEmail, normalizePhone } from './normalization.ts';

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^fc00:/i,
  /^fe80:/i,
  /\.local$/i,
  /\.internal$/i,
];

export function validateSafeWebhookUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function dispatchExternalAlert(params: {
  event: 'APPOINTMENT_BOOKED' | 'DATA_REQUEST_APPROVED' | 'SLA_ALERT' | 'LEAVE_APPROVED';
  title: string;
  message: string;
}) {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'integrations')).limit(1);
    const config = (row?.value as Record<string, any>) || {};
    const webhookUrl = validateSafeWebhookUrl(config.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL);
    if (!webhookUrl) return;

    if (params.event === 'APPOINTMENT_BOOKED' && config.notifyOnAppointment === false) return;
    if (params.event === 'DATA_REQUEST_APPROVED' && config.notifyOnDataRequest === false) return;
    if (params.event === 'SLA_ALERT' && config.notifyOnSlaBreach === false) return;

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `*${params.title}*\n${params.message}`,
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  } catch {
    // Non-blocking external alert
  }
}

export async function sendSystemEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || 'CadenceOps <no-reply@cadenceops.io>';
  if (!apiKey) return false;

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function getDncLookupSets() {
  const rows = await db.select().from(dncSuppression);
  const domains = new Set<string>();
  const emails = new Set<string>();
  const phones = new Set<string>();

  for (const r of rows) {
    if (r.type === 'DOMAIN') domains.add(r.value);
    else if (r.type === 'EMAIL') emails.add(r.value);
    else if (r.type === 'PHONE') phones.add(r.value);
  }
  return { domains, emails, phones, rows };
}

export function normalizeDncValue(type: string, raw: string): string | null {
  if (type === 'DOMAIN') return normalizeDomain(raw);
  if (type === 'EMAIL') return normalizeEmail(raw);
  if (type === 'PHONE') return normalizePhone(raw);
  return raw.trim().toLowerCase() || null;
}
