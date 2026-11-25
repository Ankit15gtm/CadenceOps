export const REMARK_CATEGORIES = [
  { value: 'GENERAL', label: 'General Remark' },
  { value: 'PAIN_POINT', label: 'Pain Point / Need' },
  { value: 'BUDGET_TIMELINE', label: 'Budget & Timeline' },
  { value: 'DECISION_MAKER', label: 'Decision Maker Insight' },
  { value: 'COMPETITOR_STACK', label: 'Competitor / Tech Stack' },
  { value: 'OBJECTION', label: 'Objection / Blocker' },
  { value: 'NEXT_STEP', label: 'Next Step / Strategy' },
  { value: 'HANDOVER', label: 'Manager Handover Note' },
] as const;

export const SENTIMENT_OPTIONS = [
  { value: '', label: 'Not Set' },
  { value: 'HOT', label: 'Hot / Ready' },
  { value: 'WARM', label: 'Warm / Engaged' },
  { value: 'NEUTRAL', label: 'Neutral / Exploring' },
  { value: 'COOL', label: 'Cool / Low Priority' },
  { value: 'BLOCKER', label: 'Blocked / Resistant' },
] as const;

export function getRemarkCategoryLabel(category: string): string {
  return REMARK_CATEGORIES.find((c) => c.value === category)?.label || category.replace(/_/g, ' ');
}

export function getRemarkCategoryStyle(category: string): string {
  switch (category) {
    case 'PAIN_POINT':
      return 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
    case 'BUDGET_TIMELINE':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'DECISION_MAKER':
      return 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300';
    case 'COMPETITOR_STACK':
      return 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300';
    case 'OBJECTION':
      return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    case 'NEXT_STEP':
      return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
    case 'HANDOVER':
      return 'border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300';
    default:
      return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}

export function getSentimentStyle(sentiment?: string | null): string {
  switch (sentiment) {
    case 'HOT':
      return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'WARM':
      return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300';
    case 'COOL':
      return 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400';
    case 'BLOCKER':
      return 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  }
}
