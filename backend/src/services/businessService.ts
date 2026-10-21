import type { DB } from '../db/connection';
import { scoreLead, type ScoreBreakdown } from '../domain/leadScore';
import type { EmployeeBand, Priority, Sort, TelusStatus } from '../domain/constants';
import { AppError } from '../errors';
import type { BBox } from '../schemas';

export type Claim =
  | { status: 'unclaimed' }
  | { status: 'mine'; priority: Priority }
  | { status: 'other'; agentId: string; agentName: string };

export interface BusinessSummary {
  id: number;
  name: string;
  industry: string;
  subCategory: string;
  address: string;
  neighbourhood: string;
  city: string;
  lat: number;
  lng: number;
  employeeCount: number;
  employeeBand: EmployeeBand;
  telusStatus: TelusStatus;
  competitorProvider: string | null;
  contractEndDate: string | null;
  leadScore: number;
  claim: Claim;
  distanceKm?: number;
}

export interface BusinessDetail extends BusinessSummary {
  postalCode: string;
  phone: string | null;
  website: string | null;
  revenueBand: string;
  yearEstablished: number | null;
  lastContactedAt: string | null;
  notes: string | null;
  /** How the lead score is built: base + one line per factor, summing to `leadScore`. */
  scoreBreakdown: ScoreBreakdown & { scoredAt: string };
}

export interface SearchParams {
  bbox: BBox;
  q?: string;
  industry?: string[];
  employeeBand?: string[];
  telusStatus?: string[];
  minScore?: number;
  renewalWithinDays?: number;
  claim: 'all' | 'unclaimed' | 'mine';
  sort: Sort;
  center?: { lng: number; lat: number };
  limit: number;
}

export interface SearchResult {
  items: BusinessSummary[];
  total: number;
  truncated: boolean;
  /** Counts per industry in the current view, ignoring the industry filter itself (so the UI can show "Retail (12)"). */
  facets: { industry: Record<string, number> };
}

interface BusinessRow {
  id: number;
  name: string;
  industry: string;
  sub_category: string;
  address: string;
  neighbourhood: string;
  city: string;
  postal_code: string;
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  employee_count: number;
  employee_band: EmployeeBand;
  revenue_band: string;
  year_established: number | null;
  telus_status: TelusStatus;
  competitor_provider: string | null;
  contract_end_date: string | null;
  lead_score: number;
  scored_at: string;
  last_contacted_at: string | null;
  notes: string | null;
  claim_agent_id: string | null;
  claim_agent_name: string | null;
  claim_priority: Priority | null;
}

const CLAIM_JOIN = `
  LEFT JOIN queue_items qi ON qi.business_id = b.id
  LEFT JOIN agents ca ON ca.id = qi.agent_id`;
const CLAIM_COLS = `qi.agent_id AS claim_agent_id, ca.name AS claim_agent_name, qi.priority AS claim_priority`;

/** Turns free text into a safe FTS5 prefix query: `sushi gran` -> `"sushi"* "gran"*` (AND). */
export function toFtsQuery(q: string): string | null {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!tokens?.length) return null;
  return tokens.slice(0, 8).map((t) => `"${t}"*`).join(' ');
}

/** Haversine distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function claimOf(row: BusinessRow, agentId: string): Claim {
  if (!row.claim_agent_id) return { status: 'unclaimed' };
  if (row.claim_agent_id === agentId) return { status: 'mine', priority: row.claim_priority ?? 'medium' };
  return { status: 'other', agentId: row.claim_agent_id, agentName: row.claim_agent_name ?? 'Another agent' };
}

export function toSummary(row: BusinessRow, agentId: string, ref?: { lat: number; lng: number }): BusinessSummary {
  const s: BusinessSummary = {
    id: row.id,
    name: row.name,
    industry: row.industry,
    subCategory: row.sub_category,
    address: row.address,
    neighbourhood: row.neighbourhood,
    city: row.city,
    lat: row.lat,
    lng: row.lng,
    employeeCount: row.employee_count,
    employeeBand: row.employee_band,
    telusStatus: row.telus_status,
    competitorProvider: row.competitor_provider,
    contractEndDate: row.contract_end_date,
    leadScore: row.lead_score,
    claim: claimOf(row, agentId),
  };
  if (ref) s.distanceKm = Math.round(distanceKm(ref, row) * 100) / 100;
  return s;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function createBusinessService(db: DB, clock: () => Date = () => new Date()) {
  const byIdStmt = db.prepare(`SELECT b.*, ${CLAIM_COLS} FROM businesses b ${CLAIM_JOIN} WHERE b.id = ?`);

  function buildWhere(p: SearchParams, agentId: string, opts: { skipIndustry?: boolean } = {}) {
    const clauses = [
      // R*Tree overlap lookup narrows candidates via the spatial index. R*Tree stores float32 (rounded
      // outward), so an exact check on the real double-precision columns follows for edge correctness.
      'r.max_lng >= @minLng AND r.min_lng <= @maxLng AND r.max_lat >= @minLat AND r.min_lat <= @maxLat',
      'b.lng BETWEEN @minLng AND @maxLng AND b.lat BETWEEN @minLat AND @maxLat',
    ];
    const params: Record<string, unknown> = { ...p.bbox };

    const fts = p.q ? toFtsQuery(p.q) : null;
    if (fts) {
      clauses.push('b.id IN (SELECT rowid FROM business_fts WHERE business_fts MATCH @fts)');
      params.fts = fts;
    }
    const inList = (col: string, key: string, values?: string[]) => {
      if (!values?.length) return;
      const names = values.map((v, i) => {
        params[`${key}${i}`] = v;
        return `@${key}${i}`;
      });
      clauses.push(`${col} IN (${names.join(', ')})`);
    };
    if (!opts.skipIndustry) inList('b.industry', 'industry', p.industry);
    inList('b.employee_band', 'band', p.employeeBand);
    inList('b.telus_status', 'telus', p.telusStatus);

    if (p.minScore !== undefined) {
      clauses.push('b.lead_score >= @minScore');
      params.minScore = p.minScore;
    }
    if (p.renewalWithinDays !== undefined) {
      // Includes already-expired (month-to-month) contracts: those are the easiest switches.
      clauses.push('b.competitor_provider IS NOT NULL AND b.contract_end_date IS NOT NULL AND b.contract_end_date <= @renewalEnd');
      params.renewalEnd = isoDay(new Date(clock().getTime() + p.renewalWithinDays * 86_400_000));
    }
    if (p.claim === 'unclaimed') clauses.push('qi.id IS NULL');
    if (p.claim === 'mine') {
      clauses.push('qi.agent_id = @agentId');
      params.agentId = agentId;
    }
    return { where: clauses.join('\n  AND '), params };
  }

  function orderBy(p: SearchParams, params: Record<string, unknown>): string {
    switch (p.sort) {
      case 'distance': {
        // Equirectangular approximation: monotonic with true distance at city scale and needs no SQL trig.
        params.cLat = p.center!.lat;
        params.cLng = p.center!.lng;
        params.cosLat = Math.cos((p.center!.lat * Math.PI) / 180);
        return '((b.lat - @cLat) * (b.lat - @cLat) + ((b.lng - @cLng) * @cosLat) * ((b.lng - @cLng) * @cosLat)) ASC, b.id';
      }
      case 'renewal':
        return 'b.contract_end_date IS NULL, b.contract_end_date ASC, b.lead_score DESC, b.id';
      case 'name':
        return 'b.name COLLATE NOCASE ASC, b.id';
      case 'score':
      default:
        return 'b.lead_score DESC, b.id';
    }
  }

  const FROM = `FROM business_rtree r JOIN businesses b ON b.id = r.id ${CLAIM_JOIN}`;

  return {
    search(p: SearchParams, agentId: string): SearchResult {
      const { where, params } = buildWhere(p, agentId);
      const order = orderBy(p, params);
      const rows = db
        .prepare(`SELECT b.*, ${CLAIM_COLS} ${FROM} WHERE ${where} ORDER BY ${order} LIMIT @limit`)
        .all({ ...params, limit: p.limit }) as BusinessRow[];
      const { n: total } = db.prepare(`SELECT COUNT(*) AS n ${FROM} WHERE ${where}`).get(params) as { n: number };

      const facetWhere = buildWhere(p, agentId, { skipIndustry: true });
      const facetRows = db
        .prepare(`SELECT b.industry AS industry, COUNT(*) AS n ${FROM} WHERE ${facetWhere.where} GROUP BY b.industry`)
        .all(facetWhere.params) as Array<{ industry: string; n: number }>;

      const ref = p.center ?? { lng: (p.bbox.minLng + p.bbox.maxLng) / 2, lat: (p.bbox.minLat + p.bbox.maxLat) / 2 };
      return {
        items: rows.map((r) => toSummary(r, agentId, ref)),
        total,
        truncated: total > rows.length,
        facets: { industry: Object.fromEntries(facetRows.map((f) => [f.industry, f.n])) },
      };
    },

    suggest(q: string, limit: number, agentId: string): BusinessSummary[] {
      const fts = toFtsQuery(q);
      if (!fts) return [];
      const rows = db
        .prepare(
          `SELECT b.*, ${CLAIM_COLS}
           FROM business_fts f JOIN businesses b ON b.id = f.rowid ${CLAIM_JOIN}
           WHERE business_fts MATCH @fts
           ORDER BY bm25(business_fts, 10.0, 3.0, 2.0, 1.0, 1.0, 1.0), b.lead_score DESC
           LIMIT @limit`,
        )
        .all({ fts, limit }) as BusinessRow[];
      return rows.map((r) => toSummary(r, agentId));
    },

    getById(id: number, agentId: string): BusinessDetail {
      const row = byIdStmt.get(id) as BusinessRow | undefined;
      if (!row) throw AppError.notFound(`Business ${id} not found`);
      // Explain the score as of when it was computed, so the lines always add up to the stored score.
      const { breakdown } = scoreLead(row, new Date(row.scored_at));
      return {
        ...toSummary(row, agentId),
        postalCode: row.postal_code,
        phone: row.phone,
        website: row.website,
        revenueBand: row.revenue_band,
        yearEstablished: row.year_established,
        lastContactedAt: row.last_contacted_at,
        notes: row.notes,
        scoreBreakdown: { ...breakdown, scoredAt: row.scored_at },
      };
    },

    /** Raw row lookup used by the queue service. */
    getRow(id: number) {
      return byIdStmt.get(id) as BusinessRow | undefined;
    },
  };
}

export type BusinessService = ReturnType<typeof createBusinessService>;
