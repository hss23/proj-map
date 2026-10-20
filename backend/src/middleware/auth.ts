import type { RequestHandler } from 'express';
import type { DB } from '../db/connection';
import { AppError } from '../errors';

export interface Agent {
  id: string;
  name: string;
  territory: string;
  homeLat: number;
  homeLng: number;
}

declare module 'express-serve-static-core' {
  interface Request {
    agent?: Agent;
  }
}

/**
 * Mock auth: `Authorization: Bearer <token>` maps to a seeded agent.
 * In production this is replaced by verifying an OIDC/JWT from the SSO provider;
 * the rest of the app only depends on `req.agent`.
 */
export function authenticate(db: DB): RequestHandler {
  const findByToken = db.prepare(
    'SELECT id, name, territory, home_lat AS homeLat, home_lng AS homeLng FROM agents WHERE token = ?',
  );
  return (req, _res, next) => {
    const header = req.header('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) return next(new AppError(401, 'UNAUTHORIZED', 'Missing bearer token'));
    const agent = findByToken.get(match[1]) as Agent | undefined;
    if (!agent) return next(new AppError(401, 'UNAUTHORIZED', 'Invalid token'));
    req.agent = agent;
    next();
  };
}

/** Narrowing helper for handlers mounted behind `authenticate`. */
export function currentAgent(req: { agent?: Agent }): Agent {
  if (!req.agent) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
  return req.agent;
}
