import { DEFAULT_FILTERS, INDUSTRY_ICONS, MIN_ZOOM } from './constants';
import type { ClaimFilter, EmployeeBand, Filters, SortKey, TelusStatus } from './types';

/**
 * The shareable part of the UI state, mirrored into the URL query string so a
 * view (area + filters + selected business) survives reloads and can be sent
 * to a teammate. Parsing is defensive: junk values are dropped, never thrown.
 */
export interface UrlState {
  filters: Filters;
  sort: SortKey;
  center: { lat: number; lng: number } | null;
  zoom: number | null;
  selectedId: number | null;
}

const INDUSTRIES = Object.keys(INDUSTRY_ICONS);
const BANDS: EmployeeBand[] = ['1-9', '10-49', '50-199', '200+'];
const STATUSES: TelusStatus[] = ['none', 'mobility', 'internet', 'mobility+internet'];
const CLAIMS: ClaimFilter[] = ['all', 'unclaimed', 'mine'];
const SORTS: SortKey[] = ['score', 'distance', 'renewal', 'name'];

function list<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map((s) => s.trim()))].filter((s): s is T => allowed.includes(s as T));
}

function int(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const claim = p.get('claim') as ClaimFilter | null;
  const sort = p.get('sort') as SortKey | null;

  let center: UrlState['center'] = null;
  const c = p.get('c')?.split(',').map(Number);
  if (c && c.length === 2 && c.every(Number.isFinite) && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180) {
    center = { lat: c[0], lng: c[1] };
  }

  return {
    filters: {
      q: (p.get('q') ?? '').slice(0, 100),
      industry: list(p.get('ind'), INDUSTRIES),
      employeeBand: list(p.get('size'), BANDS),
      telusStatus: list(p.get('telus'), STATUSES),
      minScore: int(p.get('min'), 0, 100),
      renewalWithinDays: int(p.get('renew'), 1, 730),
      claim: claim && CLAIMS.includes(claim) ? claim : 'all',
    },
    sort: sort && SORTS.includes(sort) ? sort : 'score',
    center,
    zoom: int(p.get('z'), MIN_ZOOM, 19),
    selectedId: int(p.get('sel'), 1, Number.MAX_SAFE_INTEGER),
  };
}

export function serializeUrlState(s: UrlState): string {
  const p = new URLSearchParams();
  const f = s.filters;
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.industry.length) p.set('ind', f.industry.join(','));
  if (f.employeeBand.length) p.set('size', f.employeeBand.join(','));
  if (f.telusStatus.length) p.set('telus', f.telusStatus.join(','));
  if (f.minScore !== null) p.set('min', String(f.minScore));
  if (f.renewalWithinDays !== null) p.set('renew', String(f.renewalWithinDays));
  if (f.claim !== DEFAULT_FILTERS.claim) p.set('claim', f.claim);
  if (s.sort !== 'score') p.set('sort', s.sort);
  if (s.center) p.set('c', `${s.center.lat.toFixed(5)},${s.center.lng.toFixed(5)}`);
  if (s.zoom !== null) p.set('z', String(Math.round(s.zoom)));
  if (s.selectedId !== null) p.set('sel', String(s.selectedId));
  return p.toString();
}

/** Number of active filters (for badges and the "Clear all" affordance). */
export function activeFilterCount(f: Filters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    f.industry.length +
    f.employeeBand.length +
    f.telusStatus.length +
    (f.minScore !== null ? 1 : 0) +
    (f.renewalWithinDays !== null ? 1 : 0) +
    (f.claim !== 'all' ? 1 : 0)
  );
}
