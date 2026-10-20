import express from 'express';
import type { DB } from './db/connection';
import { authenticate, currentAgent } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/errors';
import { businessRoutes } from './routes/businesses';
import { metaRoutes } from './routes/meta';
import { queueRoutes } from './routes/queue';
import { createBusinessService } from './services/businessService';
import { createQueueService } from './services/queueService';

export interface AppOptions {
  /** Injectable clock so tests are deterministic. */
  clock?: () => Date;
  logRequests?: boolean;
}

export function createApp(db: DB, opts: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false); // queue/claim state changes often; avoid stale 304s
  app.use(express.json({ limit: '50kb' }));

  if (opts.logRequests) {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
      next();
    });
  }

  const businesses = createBusinessService(db, opts.clock);
  const queue = createQueueService(db, businesses);

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  api.use(authenticate(db));
  api.get('/me', (req, res) => {
    res.json(currentAgent(req));
  });
  api.use('/businesses', businessRoutes(businesses));
  api.use('/queue', queueRoutes(queue));
  api.use('/meta', metaRoutes(db));
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
