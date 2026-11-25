export function normalizeDomain(input?: string | null): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // If an email was accidentally passed, extract domain
  if (value.includes('@') && !value.includes('/')) {
    value = value.split('@')[1] || '';
  }

  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/^www\./i, '');
  value = value.split('/')[0] || '';
  value = value.split('?')[0] || '';
  value = value.split('#')[0] || '';
  value = value.split(':')[0] || '';
  value = value.trim();

  if (!value || !value.includes('.')) return null;
  return value;
}

export function normalizeWebsite(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeCompanyName(input?: string | null): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|pvt|private|sa|ag|bv)\b\.?/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function normalizeEmail(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizePhone(input?: string | null): string | null {
  if (!input) return null;
  const digits = input.replace(/\D+/g, '');
  if (digits.length < 7) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export function normalizeLinkedin(input?: string | null): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value || !value.includes('linkedin.com/')) return null;
  value = value.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  value = value.split('?')[0] || '';
  value = value.split('#')[0] || '';
  value = value.replace(/\/+$/, '');
  return value;
}

export function isValidUrl(input?: string | null): boolean {
  if (!input) return true;
  try {
    const candidate = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function computeRecordQualityScores(input: {
  companyName?: string;
  website?: string;
  domain?: string;
  linkedinUrl?: string;
  industry?: string;
  employeeSize?: string;
  country?: string;
  workEmail?: string;
  phone?: string;
  jobTitle?: string;
  providedAiScore?: number | string | null;
  providedFitScore?: number | string | null;
}): { aiScore: number; fitScore: number; validationStatus: 'VALID' | 'MISSING_INFO' | 'INVALID'; issues: string[] } {
  const issues: string[] = [];

  if (!input.companyName || !input.companyName.trim()) {
    issues.push('Missing company name');
  }
  if (input.workEmail && !normalizeEmail(input.workEmail)) {
    issues.push('Invalid email format');
  }
  if (input.website && !isValidUrl(input.website)) {
    issues.push('Invalid website URL');
  }

  const missingRecommended: string[] = [];
  if (!input.domain && !input.website) missingRecommended.push('website/domain');
  if (!input.workEmail && !input.phone && !input.linkedinUrl) missingRecommended.push('contact channel');
  if (!input.industry) missingRecommended.push('industry');
  if (!input.country) missingRecommended.push('country');

  let validationStatus: 'VALID' | 'MISSING_INFO' | 'INVALID' = 'VALID';
  if (issues.length > 0) {
    validationStatus = 'INVALID';
  } else if (missingRecommended.length > 0) {
    validationStatus = 'MISSING_INFO';
  }

  const parsedAi = Number(input.providedAiScore);
  const parsedFit = Number(input.providedFitScore);

  let computedAi = !Number.isNaN(parsedAi) && parsedAi > 0 ? Math.min(100, Math.round(parsedAi)) : 55;
  let computedFit = !Number.isNaN(parsedFit) && parsedFit > 0 ? Math.min(100, Math.round(parsedFit)) : 50;

  if (!parsedAi || Number.isNaN(parsedAi)) {
    if (input.domain || input.website) computedAi += 10;
    if (input.workEmail && normalizeEmail(input.workEmail)) computedAi += 15;
    if (input.linkedinUrl) computedAi += 10;
    if (input.phone) computedAi += 5;
    if (input.industry) computedAi += 5;
    computedAi = Math.min(98, computedAi);
  }

  if (!parsedFit || Number.isNaN(parsedFit)) {
    if (input.jobTitle) computedFit += 15;
    if (input.employeeSize) computedFit += 10;
    if (input.country) computedFit += 10;
    if (input.industry) computedFit += 10;
    computedFit = Math.min(98, computedFit);
  }

  return {
    aiScore: computedAi,
    fitScore: computedFit,
    validationStatus,
    issues: issues.length ? issues : missingRecommended.map((m) => `Missing ${m}`),
  };
}
