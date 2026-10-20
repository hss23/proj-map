import { Router } from 'express';
import { currentAgent } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { businessIdParams, searchQuery, suggestQuery } from '../schemas';
import type { BusinessService } from '../services/businessService';

export function businessRoutes(service: BusinessService) {
  const r = Router();

  /** Map search: everything inside the bbox that matches the filters. */
  r.get('/', validate({ query: searchQuery }), (req, res) => {
    res.json(service.search(req.valid.query, currentAgent(req).id));
  });

  /** Typeahead across the whole dataset (not limited to the viewport). */
  r.get('/suggest', validate({ query: suggestQuery }), (req, res) => {
    const { q, limit } = req.valid.query;
    res.json({ items: service.suggest(q, limit, currentAgent(req).id) });
  });

  r.get('/:id', validate({ params: businessIdParams }), (req, res) => {
    res.json(service.getById(req.valid.params.id, currentAgent(req).id));
  });

  return r;
}
