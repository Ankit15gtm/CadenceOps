export interface DealStageMeta {
  value: 'DISCOVERY' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';
  label: string;
  defaultProbability: number;
  badgeStyle: string;
  columnBorder: string;
}

export const DEAL_STAGES: DealStageMeta[] = [
  {
    value: 'DISCOVERY',
    label: 'Discovery',
    defaultProbability: 20,
    badgeStyle: 'border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200',
    columnBorder: 'border-t-slate-500',
  },
  {
    value: 'PROPOSAL',
    label: 'Proposal Sent',
    defaultProbability: 50,
    badgeStyle: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300',
    columnBorder: 'border-t-blue-600',
  },
  {
    value: 'NEGOTIATION',
    label: 'Negotiation',
    defaultProbability: 75,
    badgeStyle: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    columnBorder: 'border-t-amber-600',
  },
  {
    value: 'CLOSED_WON',
    label: 'Closed Won',
    defaultProbability: 100,
    badgeStyle: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    columnBorder: 'border-t-emerald-600',
  },
  {
    value: 'CLOSED_LOST',
    label: 'Closed Lost',
    defaultProbability: 0,
    badgeStyle: 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300',
    columnBorder: 'border-t-red-600',
  },
];

export function getDealStageMeta(stage: string): DealStageMeta {
  return DEAL_STAGES.find((s) => s.value === stage) || DEAL_STAGES[0]!;
}
