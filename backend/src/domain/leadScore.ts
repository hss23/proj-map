import type { EmployeeBand, TelusStatus } from './constants';

export interface ScoringInput {
  industry: string;
  employee_band: EmployeeBand;
  telus_status: TelusStatus;
  competitor_provider: string | null;
  contract_end_date: string | null;
  last_contacted_at: string | null;
}

export interface LeadSignal {
  tone: 'positive' | 'neutral' | 'negative';
  label: string;
}

const HIGH_FIT_INDUSTRIES = new Set([
  'Professional Services',
  'Technology',
  'Healthcare',
  'Transportation & Logistics',
]);

const DAY_MS = 86_400_000;

export function daysUntil(isoDate: string, now: Date): number {
  return Math.round((Date.parse(isoDate) - now.getTime()) / DAY_MS);
}

/**
 * Transparent, rule-based lead score (0-100). Every point maps to a signal the
 * agent can see in the UI ("why this lead"), which matters more for trust than
 * model sophistication in a prototype.
 */
export function scoreLead(b: ScoringInput, now: Date): { score: number; signals: LeadSignal[] } {
  let score = 10;
  const signals: LeadSignal[] = [];

  const sizePoints: Record<EmployeeBand, number> = { '1-9': 5, '10-49': 20, '50-199': 28, '200+': 32 };
  score += sizePoints[b.employee_band];
  if (b.employee_band === '1-9') {
    signals.push({ tone: 'neutral', label: 'Micro business (1–9 employees)' });
  } else {
    signals.push({ tone: 'positive', label: `${b.employee_band} employees: multi-line opportunity` });
  }

  if (b.telus_status === 'none') {
    score += 20;
    signals.push({
      tone: 'positive',
      label: b.competitor_provider ? `Not a TELUS customer (with ${b.competitor_provider})` : 'Not a TELUS customer',
    });
  } else if (b.telus_status === 'mobility+internet') {
    signals.push({ tone: 'negative', label: 'Already TELUS for mobility + internet' });
  } else {
    score += 15;
    const missing = b.telus_status === 'mobility' ? 'internet' : 'mobility';
    signals.push({ tone: 'positive', label: `TELUS ${b.telus_status} only: upsell ${missing}` });
  }

  if (b.contract_end_date && b.competitor_provider) {
    const days = daysUntil(b.contract_end_date, now);
    if (days < 0) {
      score += 18;
      signals.push({ tone: 'positive', label: `${b.competitor_provider} contract expired: month-to-month` });
    } else if (days <= 90) {
      score += 25;
      signals.push({ tone: 'positive', label: `${b.competitor_provider} contract ends in ${days} days` });
    } else if (days <= 180) {
      score += 15;
      signals.push({ tone: 'positive', label: `${b.competitor_provider} contract ends in ~${Math.round(days / 30)} months` });
    } else if (days <= 365) {
      score += 5;
      signals.push({ tone: 'neutral', label: `Renewal in ~${Math.round(days / 30)} months` });
    } else {
      signals.push({ tone: 'negative', label: 'Locked in a contract for 12+ months' });
    }
  }

  if (b.last_contacted_at) {
    const daysAgo = -daysUntil(b.last_contacted_at, now);
    if (daysAgo <= 30) {
      score -= 10;
      signals.push({ tone: 'negative', label: `Contacted ${daysAgo} days ago` });
    }
  } else {
    score += 5;
    signals.push({ tone: 'positive', label: 'Never contacted' });
  }

  if (HIGH_FIT_INDUSTRIES.has(b.industry)) {
    score += 5;
    signals.push({ tone: 'positive', label: `${b.industry}: high connectivity needs` });
  }

  return { score: Math.max(0, Math.min(100, score)), signals };
}
