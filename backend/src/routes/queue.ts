import { Router } from 'express';
import { currentAgent } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { addToQueueBody, queueBusinessParams, reorderQueueBody, updateQueueBody } from '../schemas';
import type { QueueService } from '../services/queueService';

/** All queue routes are scoped to the authenticated agent: there is no agentId in the URL to tamper with. */
export function queueRoutes(service: QueueService) {
  const r = Router();

  r.get('/', (req, res) => {
    res.json({ items: service.list(currentAgent(req).id) });
  });

  r.post('/', validate({ body: addToQueueBody }), (req, res) => {
    const item = service.add(currentAgent(req).id, req.valid.body);
    res.status(201).location(`/api/queue/${item.businessId}`).json(item);
  });

  // Must be registered before '/:businessId' routes.
  r.put('/order', validate({ body: reorderQueueBody }), (req, res) => {
    res.json({ items: service.reorder(currentAgent(req).id, req.valid.body.businessIds) });
  });

  r.patch('/:businessId', validate({ params: queueBusinessParams, body: updateQueueBody }), (req, res) => {
    res.json(service.update(currentAgent(req).id, req.valid.params.businessId, req.valid.body));
  });

  r.delete('/:businessId', validate({ params: queueBusinessParams }), (req, res) => {
    service.remove(currentAgent(req).id, req.valid.params.businessId);
    res.status(204).end();
  });

  return r;
}
