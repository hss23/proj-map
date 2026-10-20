import { Router } from 'express';
import type { DB } from '../db/connection';
import { CLAIM_FILTERS, EMPLOYEE_BANDS, INDUSTRIES, PRIORITIES, SORTS, TELUS_STATUSES } from '../domain/constants';
import { MAX_BBOX_SPAN } from '../schemas';

export function metaRoutes(db: DB) {
  const r = Router();
  const providers = db.prepare(
    'SELECT DISTINCT competitor_provider FROM businesses WHERE competitor_provider IS NOT NULL ORDER BY 1',
  );

  /** Filter vocabularies, so the UI never hard-codes values the API would reject. */
  r.get('/filters', (_req, res) => {
    res.json({
      industries: INDUSTRIES,
      employeeBands: EMPLOYEE_BANDS,
      telusStatuses: TELUS_STATUSES,
      priorities: PRIORITIES,
      claimFilters: CLAIM_FILTERS,
      sorts: SORTS,
      competitors: providers.pluck().all(),
      maxBboxSpan: MAX_BBOX_SPAN,
    });
  });

  return r;
}
