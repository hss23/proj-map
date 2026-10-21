import type { EmployeeBand, TelusStatus } from './constants';

export interface ScoringInput {
  industry: string;
  employee_band: EmployeeBand;
  telus_status: TelusStatus;
  competitor_provider: string | null;
  contract_end_date: string | null;
  last_contacted_at: string | null;
}

export type ScoreFactor = 'size' | 'telus' | 'renewal' | 'contact' | 'industry';

/** One line of the score breakdown: what we saw, and how many points it is worth. */
export interface LeadSignal {
  factor: ScoreFactor;
  tone: 'positive' | 'neutral' | 'negative';
  label: string;
  points: number;
  /** Most points this factor can contribute (for proportion bars in the UI). */
  max: number;
}

export interface ScoreBreakdown {
  base: number;
  factors: LeadSignal[];
  /** base + Σ points, before clamping to 0–100. */
  raw: number;
  total: number;
}

export const SCORE_BASE = 10;

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

const ago = (days: number) => (days < 60 ? `${days} days ago` : days < 365 ? `${Math.round(days / 30)} months ago` : 'over a year ago');

/**
 * Transparent, rule-based lead score (0-100). Every factor always reports a line with its
 * points, even 0 or negative ones, so the breakdown adds up exactly to the score. An
 * agent can see why a lead is hot, which matters more for trust than model sophistication.
 */
export function scoreLead(b: ScoringInput, now: Date): { score: number; breakdown: ScoreBreakdown } {
  const factors: LeadSignal[] = [];

  // Company size: more lines and locations to win.
  const sizePoints: Record<EmployeeBand, number> = { '1-9': 5, '10-49': 20, '50-199': 28, '200+': 32 };
  factors.push(
    b.employee_band === '1-9'
      ? { factor: 'size', tone: 'neutral', label: 'Micro business (1–9 employees)', points: sizePoints['1-9'], max: 32 }
      : { factor: 'size', tone: 'positive', label: `${b.employee_band} employees: multi-line opportunity`, points: sizePoints[b.employee_band], max: 32 },
  );

  // TELUS relationship: net-new or upsell potential.
  if (b.telus_status === 'none') {
    factors.push({
      factor: 'telus',
      tone: 'positive',
      label: b.competitor_provider ? `Not a TELUS customer (with ${b.competitor_provider})` : 'Not a TELUS customer',
      points: 20,
      max: 20,
    });
  } else if (b.telus_status === 'mobility+internet') {
    factors.push({ factor: 'telus', tone: 'negative', label: 'Already TELUS for mobility + internet', points: 0, max: 20 });
  } else {
    const missing = b.telus_status === 'mobility' ? 'internet' : 'mobility';
    factors.push({ factor: 'telus', tone: 'positive', label: `TELUS ${b.telus_status} only: upsell ${missing}`, points: 15, max: 20 });
  }

  // Contract renewal: the strongest timing signal.
  if (b.contract_end_date && b.competitor_provider) {
    const days = daysUntil(b.contract_end_date, now);
    const p = b.competitor_provider;
    if (days < 0) factors.push({ factor: 'renewal', tone: 'positive', label: `${p} contract expired: month-to-month`, points: 18, max: 25 });
    else if (days <= 90) factors.push({ factor: 'renewal', tone: 'positive', label: `${p} contract ends in ${days} days`, points: 25, max: 25 });
    else if (days <= 180) factors.push({ factor: 'renewal', tone: 'positive', label: `${p} contract ends in ~${Math.round(days / 30)} months`, points: 15, max: 25 });
    else if (days <= 365) factors.push({ factor: 'renewal', tone: 'neutral', label: `Renewal in ~${Math.round(days / 30)} months`, points: 5, max: 25 });
    else factors.push({ factor: 'renewal', tone: 'negative', label: 'Locked in a contract for 12+ months', points: 0, max: 25 });
  } else {
    factors.push({ factor: 'renewal', tone: 'neutral', label: 'No competitor contract date on file', points: 0, max: 25 });
  }

  // Contact history: fresh leads up, recently-worked leads down.
  if (b.last_contacted_at) {
    const daysAgo = -daysUntil(b.last_contacted_at, now);
    factors.push(
      daysAgo <= 30
        ? { factor: 'contact', tone: 'negative', label: `Contacted ${daysAgo} days ago`, points: -10, max: 5 }
        : { factor: 'contact', tone: 'neutral', label: `Last contacted ${ago(daysAgo)}`, points: 0, max: 5 },
    );
  } else {
    factors.push({ factor: 'contact', tone: 'positive', label: 'Never contacted', points: 5, max: 5 });
  }

  // Industry fit: sectors with high connectivity needs.
  factors.push(
    HIGH_FIT_INDUSTRIES.has(b.industry)
      ? { factor: 'industry', tone: 'positive', label: `${b.industry}: high connectivity needs`, points: 5, max: 5 }
      : { factor: 'industry', tone: 'neutral', label: `${b.industry}: standard connectivity needs`, points: 0, max: 5 },
  );

  const raw = SCORE_BASE + factors.reduce((s, f) => s + f.points, 0);
  const total = Math.max(0, Math.min(100, raw));
  return { score: total, breakdown: { base: SCORE_BASE, factors, raw, total } };
}
