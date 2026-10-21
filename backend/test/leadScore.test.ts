import { describe, expect, it } from 'vitest';
import { HOODS, generateBusinesses, insidePolygon } from '../src/db/generate';
import { scoreLead } from '../src/domain/leadScore';

const now = new Date('2026-06-01T00:00:00Z');
const base = {
  industry: 'Retail',
  employee_band: '10-49' as const,
  telus_status: 'none' as const,
  competitor_provider: 'Rogers',
  contract_end_date: null,
  last_contacted_at: '2025-01-01T00:00:00Z',
};

describe('scoreLead', () => {
  it('ranks an imminent competitor renewal above a long lock-in', () => {
    const soon = scoreLead({ ...base, contract_end_date: '2026-07-01' }, now);
    const later = scoreLead({ ...base, contract_end_date: '2028-01-01' }, now);
    expect(soon.score).toBeGreaterThan(later.score);
    expect(soon.breakdown.factors.map((s) => s.label)).toContain('Rogers contract ends in 30 days');
  });

  it('penalises recent contact and existing full TELUS customers', () => {
    const fresh = scoreLead({ ...base, last_contacted_at: '2026-05-25T00:00:00Z' }, now);
    const full = scoreLead({ ...base, telus_status: 'mobility+internet', competitor_provider: null }, now);
    const plain = scoreLead(base, now);
    expect(fresh.score).toBeLessThan(plain.score);
    expect(full.score).toBeLessThan(plain.score);
  });

  it('always stays within 0-100', () => {
    for (const b of generateBusinesses(500, 7, now)) {
      expect(b.lead_score).toBeGreaterThanOrEqual(0);
      expect(b.lead_score).toBeLessThanOrEqual(100);
    }
  });
});

describe('score breakdown', () => {
  it('has exactly one line per factor and adds up to the score', () => {
    for (const b of generateBusinesses(500, 3, now)) {
      const { score, breakdown } = scoreLead(b, now);
      expect(breakdown.factors.map((f) => f.factor).sort()).toEqual(['contact', 'industry', 'renewal', 'size', 'telus']);
      expect(breakdown.raw).toBe(breakdown.base + breakdown.factors.reduce((s, f) => s + f.points, 0));
      expect(breakdown.total).toBe(Math.max(0, Math.min(100, breakdown.raw)));
      expect(score).toBe(breakdown.total);
      expect(score).toBe(b.lead_score);
    }
  });

  it('explains a hot lead with concrete points', () => {
    const { breakdown } = scoreLead(
      { ...base, employee_band: '50-199', industry: 'Technology', contract_end_date: '2026-06-21', last_contacted_at: null },
      now,
    );
    const pts = Object.fromEntries(breakdown.factors.map((f) => [f.factor, f.points]));
    expect(pts).toEqual({ size: 28, telus: 20, renewal: 25, contact: 5, industry: 5 });
    expect(breakdown.raw).toBe(93);
    expect(breakdown.total).toBe(93);
  });

  it('spans 5–97 by construction (no clamping needed) and reports negative points for recent contact', () => {
    const best = scoreLead({ ...base, employee_band: '200+', industry: 'Technology', contract_end_date: '2026-06-21', last_contacted_at: null }, now);
    expect(best.breakdown.raw).toBe(97);
    expect(best.breakdown.factors.every((f) => f.points === f.max)).toBe(true);
    const worst = scoreLead(
      { ...base, employee_band: '1-9', telus_status: 'mobility+internet', competitor_provider: null, last_contacted_at: '2026-05-30T00:00:00Z' },
      now,
    );
    expect(worst.breakdown.raw).toBe(5);
    const recent = scoreLead({ ...base, last_contacted_at: '2026-05-25T00:00:00Z' }, now);
    expect(recent.breakdown.factors.find((f) => f.factor === 'contact')).toMatchObject({ points: -10, tone: 'negative' });
  });
});

describe('generateBusinesses', () => {
  it('is deterministic for a given seed and produces unique names', () => {
    const a = generateBusinesses(500, 1, now);
    const b = generateBusinesses(500, 1, now);
    expect(a).toEqual(b);
    expect(a).toHaveLength(500);
    expect(new Set(a.map((x) => x.name)).size).toBe(500);
  });
});

describe('generated locations', () => {
  it('keeps every business on land (inside its neighbourhood polygon, not in the water)', () => {
    for (const b of generateBusinesses(500, 42, now)) {
      expect(HOODS.some((h) => insidePolygon(b.lat, b.lng, h.land))).toBe(true);
    }
  });

  it('insidePolygon handles a simple box', () => {
    const sq: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    expect(insidePolygon(0.5, 0.5, sq)).toBe(true);
    expect(insidePolygon(1.5, 0.5, sq)).toBe(false);
  });
});
