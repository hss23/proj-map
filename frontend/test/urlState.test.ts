import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from '@/lib/constants';
import { activeFilterCount, parseUrlState, serializeUrlState, type UrlState } from '@/lib/urlState';

describe('url state', () => {
  it('round-trips a full state', () => {
    const state: UrlState = {
      filters: {
        q: 'sushi',
        industry: ['Retail', 'Healthcare'],
        employeeBand: ['10-49'],
        telusStatus: ['none'],
        minScore: 75,
        renewalWithinDays: 90,
        claim: 'unclaimed',
      },
      sort: 'distance',
      center: { lat: 49.2827, lng: -123.1207 },
      zoom: 15,
      selectedId: 42,
    };
    expect(parseUrlState(serializeUrlState(state))).toEqual(state);
  });

  it('omits defaults so URLs stay short', () => {
    const qs = serializeUrlState({ filters: DEFAULT_FILTERS, sort: 'score', center: null, zoom: null, selectedId: null });
    expect(qs).toBe('');
  });

  it('drops junk values instead of throwing', () => {
    const s = parseUrlState('?ind=Retail,Spaceships&size=huge&min=500&claim=everyone&sort=random&c=abc&z=2&sel=-4');
    expect(s.filters.industry).toEqual(['Retail']);
    expect(s.filters.employeeBand).toEqual([]);
    expect(s.filters.minScore).toBeNull();
    expect(s.filters.claim).toBe('all');
    expect(s.sort).toBe('score');
    expect(s.center).toBeNull();
    expect(s.zoom).toBeNull();
    expect(s.selectedId).toBeNull();
  });

  it('counts active filters', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, q: ' x ', industry: ['Retail', 'Technology'], claim: 'mine' })).toBe(4);
  });
});
