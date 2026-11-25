import * as React from 'react';
import { CheckCircle2, Clock, AlertCircle, XCircle, CircleDot, CalendarCheck2 } from 'lucide-react';
import { cn, formatCodeLabel } from '../lib/utils.ts';

const POSITIVE_CODES = new Set([
  'ACTIVE',
  'VALID',
  'APPROVED',
  'FULFILLED',
  'COMPLETED',
  'CONFIRMED',
  'INTERESTED',
  'QUALIFIED_LEAD',
  'APPOINTMENT_BOOKED',
  'CONNECTED',
  'LINKEDIN_REQUEST_ACCEPTED',
  'CREATED',
]);

const WARNING_CODES = new Set([
  'PENDING',
  'PENDING_CONFIRMATION',
  'FOLLOW_UP_REQUIRED',
  'RESCHEDULED',
  'IN_PROGRESS',
  'MISSING_INFO',
  'READY',
  'PAUSED',
  'REUSED_DUPLICATE',
  'HIGH',
  'URGENT',
]);

const NEGATIVE_CODES = new Set([
  'OVERDUE',
  'INVALID',
  'INVALID_CONTACT',
  'INVALID_DATA',
  'DO_NOT_CONTACT',
  'NOT_INTERESTED',
  'NOT_QUALIFIED',
  'WRONG_CONTACT',
  'NO_SHOW',
  'CANCELLED',
  'REJECTED',
  'INACTIVE',
]);

export function StatusLabel({ status, className }: { status?: string | null; className?: string }) {
  const code = (status || 'NOT_YET_WORKED').toUpperCase();
  const label = formatCodeLabel(code);

  let toneClass = 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700';
  let Icon = CircleDot;

  if (code === 'APPOINTMENT_BOOKED' || code === 'SCHEDULED' || code === 'CONFIRMED') {
    toneClass = 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800';
    Icon = CalendarCheck2;
  } else if (POSITIVE_CODES.has(code)) {
    toneClass = 'text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800';
    Icon = CheckCircle2;
  } else if (NEGATIVE_CODES.has(code)) {
    toneClass = 'text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800';
    Icon = XCircle;
  } else if (WARNING_CODES.has(code)) {
    toneClass = 'text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border-amber-200 dark:border-amber-800';
    Icon = code === 'OVERDUE' ? AlertCircle : Clock;
  } else if (code !== 'NOT_YET_WORKED' && code !== 'DRAFT' && code !== 'LOW') {
    toneClass = 'text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800';
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0',
        toneClass,
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
