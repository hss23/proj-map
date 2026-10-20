import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_QUEUE_SIZE } from '../src/domain/constants';
import { setup } from './helpers';

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

const ids = (res: { body: { items: Array<{ businessId: number }> } }) => res.body.items.map((i) => i.businessId);

describe('queue: add', () => {
  it('adds a business to the end of my queue', async () => {
    await ctx.as('alex').post('/api/queue', { businessId: 1 });
    const res = await ctx.as('alex').post('/api/queue', { businessId: 2, priority: 'high', note: '  call at 9  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ businessId: 2, position: 1, priority: 'high', note: 'call at 9' });
    expect(res.body.business).toMatchObject({ id: 2, claim: { status: 'mine' } });
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([1, 2]);
  });

  it('409 ALREADY_IN_QUEUE when I add the same business twice (no duplicates)', async () => {
    await ctx.as('alex').post('/api/queue', { businessId: 1 });
    const res = await ctx.as('alex').post('/api/queue', { businessId: 1 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_IN_QUEUE');
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([1]);
  });

  it('409 ALREADY_CLAIMED when another agent already claimed it', async () => {
    await ctx.as('priya').post('/api/queue', { businessId: 7 });
    const res = await ctx.as('alex').post('/api/queue', { businessId: 7 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'ALREADY_CLAIMED',
      details: { claimedBy: { id: 'agent-priya', name: 'Priya Sandhu' } },
    });
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([]);
  });

  it('only one of several concurrent claims wins', async () => {
    const results = await Promise.all(
      (['alex', 'priya', 'sam'] as const).map((who) => ctx.as(who).post('/api/queue', { businessId: 42 })),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const owners = ctx.db.prepare('SELECT agent_id FROM queue_items WHERE business_id = 42').all();
    expect(owners).toHaveLength(1);
  });

  it('DB constraint blocks a second claim even if the service check were bypassed', () => {
    ctx.db.prepare(`INSERT INTO queue_items (agent_id, business_id, position) VALUES ('agent-alex', 5, 0)`).run();
    expect(() =>
      ctx.db.prepare(`INSERT INTO queue_items (agent_id, business_id, position) VALUES ('agent-sam', 5, 0)`).run(),
    ).toThrow(/UNIQUE/);
  });

  it('inserts at a given position (used by undo)', async () => {
    for (const id of [1, 2, 3]) await ctx.as('alex').post('/api/queue', { businessId: id });
    await ctx.as('alex').post('/api/queue', { businessId: 9, position: 1 });
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([1, 9, 2, 3]);
  });

  it.each([
    [{}, 'businessId'],
    [{ businessId: 'abc' }, 'businessId'],
    [{ businessId: '5' }, 'businessId'], // strict: no string coercion in JSON bodies
    [{ businessId: 1, priority: 'urgent' }, 'priority'],
    [{ businessId: 1, note: 'x'.repeat(501) }, 'note'],
    [{ businessId: 1, agentId: 'agent-sam' }, 'agentId'], // can't add to someone else's queue
  ])('400 for invalid body %j', async (body, field) => {
    const res = await ctx.as('alex').post('/api/queue', body);
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(field);
  });

  it('404 for a business that does not exist', async () => {
    const res = await ctx.as('alex').post('/api/queue', { businessId: 123456 });
    expect(res.status).toBe(404);
  });

  it(`422 QUEUE_FULL after ${MAX_QUEUE_SIZE} items`, async () => {
    const insert = ctx.db.prepare(`INSERT INTO queue_items (agent_id, business_id, position) VALUES ('agent-alex', ?, ?)`);
    for (let i = 1; i <= MAX_QUEUE_SIZE; i++) insert.run(i, i - 1);
    const res = await ctx.as('alex').post('/api/queue', { businessId: MAX_QUEUE_SIZE + 1 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('QUEUE_FULL');
  });
});

describe('queue: scoping', () => {
  it('each agent only sees their own queue', async () => {
    await ctx.as('alex').post('/api/queue', { businessId: 1 });
    await ctx.as('sam').post('/api/queue', { businessId: 2 });
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([1]);
    expect(ids(await ctx.as('sam').get('/api/queue'))).toEqual([2]);
  });

  it("an agent cannot remove or edit someone else's claim", async () => {
    await ctx.as('priya').post('/api/queue', { businessId: 3 });
    expect((await ctx.as('alex').delete('/api/queue/3')).status).toBe(404);
    expect((await ctx.as('alex').patch('/api/queue/3', { priority: 'low' })).status).toBe(404);
    expect(ids(await ctx.as('priya').get('/api/queue'))).toEqual([3]);
  });

  it('once released, another agent can claim the lead', async () => {
    await ctx.as('priya').post('/api/queue', { businessId: 3 });
    expect((await ctx.as('priya').delete('/api/queue/3')).status).toBe(204);
    expect((await ctx.as('alex').post('/api/queue', { businessId: 3 })).status).toBe(201);
  });
});

describe('queue: update, reorder, remove', () => {
  beforeEach(async () => {
    for (const id of [10, 20, 30]) await ctx.as('alex').post('/api/queue', { businessId: id });
  });

  it('PATCH updates priority and note, and clears a note with ""', async () => {
    let res = await ctx.as('alex').patch('/api/queue/20', { priority: 'high', note: 'Decision maker: Dana' });
    expect(res.body).toMatchObject({ priority: 'high', note: 'Decision maker: Dana' });
    res = await ctx.as('alex').patch('/api/queue/20', { note: '' });
    expect(res.body).toMatchObject({ priority: 'high', note: null });
  });

  it('PATCH requires at least one field', async () => {
    expect((await ctx.as('alex').patch('/api/queue/20', {})).status).toBe(400);
  });

  it('PUT /order persists the new order', async () => {
    const res = await ctx.as('alex').put('/api/queue/order', { businessIds: [30, 10, 20] });
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([30, 10, 20]);
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([30, 10, 20]);
  });

  it.each([
    [[30, 10], 'missing an item'],
    [[30, 10, 20, 40], 'an extra item'],
    [[30, 10, 10], 'duplicates'],
  ])('PUT /order rejects %j (%s)', async (businessIds) => {
    const res = await ctx.as('alex').put('/api/queue/order', { businessIds });
    expect(res.status).toBe(400);
    expect(ids(await ctx.as('alex').get('/api/queue'))).toEqual([10, 20, 30]);
  });

  it('DELETE removes and keeps positions contiguous', async () => {
    expect((await ctx.as('alex').delete('/api/queue/20')).status).toBe(204);
    const res = await ctx.as('alex').get('/api/queue');
    expect(res.body.items.map((i: { position: number }) => i.position)).toEqual([0, 1]);
    expect((await ctx.as('alex').delete('/api/queue/20')).status).toBe(404);
  });
});
