import request from 'supertest';
import { createApp } from '../src/app';
import { openDb } from '../src/db/connection';
import { generateBusinesses } from '../src/db/generate';
import { seedDatabase } from '../src/db/seed';

export const NOW = new Date('2026-06-01T12:00:00Z');
export const TOKENS = { alex: 'demo-token-alex', priya: 'demo-token-priya', sam: 'demo-token-sam' };
/** Covers all of Metro Vancouver. */
export const METRO_BBOX = '-123.4,49.0,-122.6,49.45';
export const DOWNTOWN_BBOX = '-123.14,49.27,-123.10,49.295';

export function setup() {
  const db = openDb(':memory:');
  const businesses = generateBusinesses(500, 42, NOW);
  seedDatabase(db, { businesses });
  const app = createApp(db, { clock: () => NOW });
  const as = (who: keyof typeof TOKENS) => {
    const auth = { Authorization: `Bearer ${TOKENS[who]}` };
    return {
      get: (url: string) => request(app).get(url).set(auth),
      post: (url: string, body?: object) => request(app).post(url).set(auth).send(body),
      patch: (url: string, body?: object) => request(app).patch(url).set(auth).send(body),
      put: (url: string, body?: object) => request(app).put(url).set(auth).send(body),
      delete: (url: string) => request(app).delete(url).set(auth),
    };
  };
  return { db, app, businesses, as };
}
