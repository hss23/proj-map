import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { toFtsQuery } from '../src/services/businessService';
import { DOWNTOWN_BBOX, METRO_BBOX, setup } from './helpers';

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await request(ctx.app).get(`/api/businesses?bbox=${METRO_BBOX}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects unknown tokens', async () => {
    const res = await request(ctx.app).get('/api/me').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });

  it('health is public', async () => {
    const res = await request(ctx.app).get('/api/health');
    expect(res.status).toBe(200);
  });

  it('returns the current agent', async () => {
    const res = await ctx.as('alex').get('/api/me');
    expect(res.body).toMatchObject({ id: 'agent-alex', name: 'Alex Morgan' });
  });
});

describe('GET /api/businesses: validation', () => {
  it.each([
    ['missing bbox', ''],
    ['wrong arity', 'bbox=1,2,3'],
    ['not numbers', 'bbox=a,b,c,d'],
    ['inverted', 'bbox=-123,49.3,-123.2,49.2'],
    ['out of range', 'bbox=-200,49,-123,49.3'],
    ['too large', 'bbox=-130,45,-120,55'],
    ['unknown industry', `bbox=${METRO_BBOX}&industry=Retail,Spaceships`],
    ['bad minScore', `bbox=${METRO_BBOX}&minScore=150`],
    ['bad sort', `bbox=${METRO_BBOX}&sort=random`],
    ['distance sort without center', `bbox=${METRO_BBOX}&sort=distance`],
    ['limit too high', `bbox=${METRO_BBOX}&limit=10000`],
  ])('400 for %s', async (_label, qs) => {
    const res = await ctx.as('alex').get(`/api/businesses?${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.length).toBeGreaterThan(0);
  });

  it('reports every invalid field at once', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=x&minScore=-1&claim=nobody`);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['bbox', 'minScore', 'claim']));
  });
});

describe('GET /api/businesses: search', () => {
  it('returns exactly the businesses inside the bbox (R*Tree matches brute force)', async () => {
    const [minLng, minLat, maxLng, maxLat] = DOWNTOWN_BBOX.split(',').map(Number);
    const expected = ctx.businesses
      .filter((b) => b.lng >= minLng && b.lng <= maxLng && b.lat >= minLat && b.lat <= maxLat)
      .map((b) => b.id)
      .sort((a, b) => a - b);

    const res = await ctx.as('alex').get(`/api/businesses?bbox=${DOWNTOWN_BBOX}&limit=500`);
    expect(res.status).toBe(200);
    expect(expected.length).toBeGreaterThan(20);
    expect(res.body.total).toBe(expected.length);
    expect(res.body.items.map((b: { id: number }) => b.id).sort((a: number, b: number) => a - b)).toEqual(expected);
  });

  it('sorts by lead score by default and reports truncation', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&limit=10`);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.total).toBe(500);
    expect(res.body.truncated).toBe(true);
    const scores = res.body.items.map((b: { leadScore: number }) => b.leadScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('combines filters with AND semantics', async () => {
    const res = await ctx.as('alex').get(
      `/api/businesses?bbox=${METRO_BBOX}&industry=Retail,Healthcare&telusStatus=none&minScore=50&limit=500`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const b of res.body.items) {
      expect(['Retail', 'Healthcare']).toContain(b.industry);
      expect(b.telusStatus).toBe('none');
      expect(b.leadScore).toBeGreaterThanOrEqual(50);
    }
    const expected = ctx.businesses.filter(
      (b) => ['Retail', 'Healthcare'].includes(b.industry) && b.telus_status === 'none' && b.lead_score >= 50,
    );
    expect(res.body.total).toBe(expected.length);
  });

  it('industry facets ignore the industry filter but respect the others', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&industry=Retail&telusStatus=none`);
    const facets = res.body.facets.industry;
    expect(Object.keys(facets).length).toBeGreaterThan(5);
    const expectedHealthcare = ctx.businesses.filter((b) => b.industry === 'Healthcare' && b.telus_status === 'none').length;
    expect(facets.Healthcare).toBe(expectedHealthcare);
  });

  it('keyword search uses prefix matching across name, category and address', async () => {
    const target = ctx.businesses[0];
    const word = target.name.split(' ')[0].slice(0, 4);
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&q=${encodeURIComponent(word)}&limit=500`);
    expect(res.body.items.map((b: { id: number }) => b.id)).toContain(target.id);
    for (const b of res.body.items) {
      const hay = `${b.name} ${b.subCategory} ${b.industry} ${b.address} ${b.city}`.toLowerCase();
      expect(hay).toContain(word.toLowerCase());
    }
  });

  it('treats FTS syntax in the keyword as plain text', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&q=${encodeURIComponent('"cafe" OR NEAR(*')}`);
    expect(res.status).toBe(200);
  });

  it('sorts by distance from a center and returns distanceKm', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&sort=distance&center=-123.12,49.28&limit=20`);
    const d = res.body.items.map((b: { distanceKm: number }) => b.distanceKm);
    expect(d).toEqual([...d].sort((a, b) => a - b));
    expect(d[0]).toBeLessThan(0.5);
  });

  it('filters by renewal window (including expired contracts)', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&renewalWithinDays=90&limit=500`);
    const cutoff = new Date('2026-08-30').getTime();
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const b of res.body.items) {
      expect(b.competitorProvider).not.toBeNull();
      expect(new Date(b.contractEndDate).getTime()).toBeLessThanOrEqual(cutoff);
    }
  });

  it('claim filter: unclaimed hides leads claimed by anyone; mine shows only my queue', async () => {
    const [a, b] = ctx.businesses;
    await ctx.as('alex').post('/api/queue', { businessId: a.id });
    await ctx.as('priya').post('/api/queue', { businessId: b.id });

    const all = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&limit=500`);
    const byId = new Map(all.body.items.map((x: { id: number }) => [x.id, x]));
    expect((byId.get(a.id) as any).claim).toEqual({ status: 'mine', priority: 'medium' });
    expect((byId.get(b.id) as any).claim).toMatchObject({ status: 'other', agentName: 'Priya Sandhu' });

    const unclaimed = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&claim=unclaimed&limit=500`);
    expect(unclaimed.body.total).toBe(498);

    const mine = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&claim=mine`);
    expect(mine.body.items.map((x: { id: number }) => x.id)).toEqual([a.id]);
  });
});

describe('GET /api/businesses/:id', () => {
  it('returns full detail with lead signals', async () => {
    const res = await ctx.as('alex').get('/api/businesses/1');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1, name: ctx.businesses[0].name, claim: { status: 'unclaimed' } });
    expect(res.body.signals.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('phone');
  });

  it('404 for a missing business, 400 for a malformed id', async () => {
    expect((await ctx.as('alex').get('/api/businesses/99999')).status).toBe(404);
    expect((await ctx.as('alex').get('/api/businesses/abc')).status).toBe(400);
  });
});

describe('GET /api/businesses/suggest', () => {
  it('finds businesses anywhere, regardless of viewport', async () => {
    const target = ctx.businesses[ctx.businesses.length - 1];
    const res = await ctx.as('alex').get(`/api/businesses/suggest?q=${encodeURIComponent(target.name)}`);
    expect(res.body.items[0].id).toBe(target.id);
  });
});

describe('toFtsQuery', () => {
  it('strips operators and quotes and turns tokens into prefix terms', () => {
    expect(toFtsQuery('Sushi  gran')).toBe('"sushi"* "gran"*');
    expect(toFtsQuery('"a" OR b*')).toBe('"a"* "or"* "b"*');
    expect(toFtsQuery('!!!')).toBeNull();
  });
});

describe('unknown routes and bad JSON', () => {
  it('404s with the standard error shape', async () => {
    const res = await ctx.as('alex').get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('400 INVALID_JSON for malformed bodies', async () => {
    const res = await request(ctx.app)
      .post('/api/queue')
      .set('Authorization', 'Bearer demo-token-alex')
      .set('Content-Type', 'application/json')
      .send('{"businessId": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('neighbourhood', () => {
  it('is returned on every business and is searchable by keyword', async () => {
    const res = await ctx.as('alex').get(`/api/businesses?bbox=${METRO_BBOX}&q=gastown&limit=500`);
    expect(res.body.items.length).toBeGreaterThan(5);
    expect(res.body.items.some((b: { neighbourhood: string }) => b.neighbourhood === 'Gastown & Chinatown')).toBe(true);
    const detail = await ctx.as('alex').get(`/api/businesses/${res.body.items[0].id}`);
    expect(typeof detail.body.neighbourhood).toBe('string');
  });
});

describe('schema versioning', () => {
  it('rebuilds an outdated database file so it can be re-seeded', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs');
    const Database = (await import('better-sqlite3')).default;
    const { openDb, SCHEMA_VERSION } = await import('../src/db/connection');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pm-')), 'old.db');
    const old = new Database(file);
    old.exec('CREATE TABLE businesses (id INTEGER PRIMARY KEY, name TEXT)'); // v1-ish shape, no neighbourhood
    old.exec("INSERT INTO businesses VALUES (1, 'stale')");
    old.close();

    const db = openDb(file);
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(db.prepare('SELECT COUNT(*) AS n FROM businesses').get()).toEqual({ n: 0 });
    const cols = (db.prepare('PRAGMA table_info(businesses)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('neighbourhood');
    db.close();
  });
});
