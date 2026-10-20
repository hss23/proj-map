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
    expect(soon.signals.map((s) => s.label)).toContain('Rogers contract ends in 30 days');
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
