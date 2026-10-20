import { test as base, expect, type APIRequestContext, type Locator, type Page, request as pwRequest } from '@playwright/test';
import type { BusinessSummary, QueueItem, SearchResponse } from '../lib/types';

export { expect };

// 1×1 transparent PNG served for every map tile: tests stay fast, offline-safe and
// don't put automated load on the public OpenStreetMap tile servers.
const BLANK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route('https://tile.openstreetmap.org/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_TILE }),
    );
    await use(page);
  },
});

export const BACKEND = 'http://localhost:4100/api';
export const AGENTS = {
  alex: { token: 'demo-token-alex', name: 'Alex Morgan' },
  priya: { token: 'demo-token-priya', name: 'Priya Sandhu' },
  sam: { token: 'demo-token-sam', name: 'Sam Chen' },
} as const;
export type AgentKey = keyof typeof AGENTS;

/** Covers all of Metro Vancouver. */
export const METRO_BBOX = '-123.4,49.0,-122.6,49.45';
export const DOWNTOWN_BBOX = '-123.14,49.27,-123.10,49.295';

// ---------------------------------------------------------------- direct API (test setup / verification)

export async function apiAs(agent: AgentKey): Promise<Api> {
  const ctx = await pwRequest.newContext({
    baseURL: `${BACKEND}/`,
    extraHTTPHeaders: { Authorization: `Bearer ${AGENTS[agent].token}` },
  });
  return new Api(ctx);
}

export class Api {
  constructor(private ctx: APIRequestContext) {}

  async search(params: Record<string, string> = {}): Promise<SearchResponse> {
    const qs = new URLSearchParams({ bbox: METRO_BBOX, limit: '500', ...params });
    const res = await this.ctx.get(`businesses?${qs}`);
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async queue(): Promise<QueueItem[]> {
    const res = await this.ctx.get('queue');
    expect(res.ok()).toBeTruthy();
    return (await res.json()).items;
  }

  async add(businessId: number, priority: 'high' | 'medium' | 'low' = 'medium') {
    return this.ctx.post('queue', { data: { businessId, priority } });
  }

  async remove(businessId: number) {
    return this.ctx.delete(`queue/${businessId}`);
  }

  async clearQueue() {
    for (const item of await this.queue()) await this.remove(item.businessId);
  }

  dispose() {
    return this.ctx.dispose();
  }
}

/** An unclaimed business in the given area, chosen at runtime so tests don't depend on seed details. */
export async function findUnclaimed(api: Api, params: Record<string, string> = {}, skip = 0): Promise<BusinessSummary> {
  const { items } = await api.search(params);
  const b = items.filter((x) => x.claim.status === 'unclaimed')[skip];
  expect(b, 'expected an unclaimed business in the dataset').toBeTruthy();
  return b;
}

// ---------------------------------------------------------------- UI helpers

export async function openApp(page: Page, query = '') {
  await page.goto(`/${query ? `?${query.replace(/^\?/, '')}` : ''}`);
  await expect(resultsCount(page)).toContainText('businesses in this area');
}

export const resultsCount = (page: Page) => page.locator('[aria-live="polite"]').filter({ hasText: 'businesses in this area' });

export async function totalResults(page: Page): Promise<number> {
  const text = await resultsCount(page).innerText();
  return Number(/(\d+)\s+businesses/.exec(text)?.[1] ?? NaN);
}

export const resultsList = (page: Page) => page.getByRole('list', { name: 'Businesses' });
export const resultCards = (page: Page) => resultsList(page).getByRole('listitem');
/** The clickable part of a result card (its accessible name is "Name, Category, lead score N"). */
export const cardButtons = (page: Page) => resultsList(page).getByRole('button', { name: /lead score \d+$/ });

export async function scoresInList(page: Page): Promise<number[]> {
  const labels = await cardButtons(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.map((l) => Number(/lead score (\d+)$/.exec(l)?.[1]));
}

export async function namesInList(page: Page): Promise<string[]> {
  const labels = await cardButtons(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  return labels.map((l) => l.split(', ')[0]);
}

export const drawer = (page: Page) => page.getByRole('complementary', { name: 'Business details' });
export const queueDrawer = (page: Page) => page.getByRole('complementary', { name: 'My queue' });
export const queueList = (page: Page) => page.getByRole('list', { name: 'Queue, in calling order' });
export const queueButton = (page: Page) => page.getByRole('button', { name: /^My queue, \d+ leads$/ });

export async function expectQueueCount(page: Page, n: number) {
  await expect(queueButton(page)).toHaveAccessibleName(`My queue, ${n} leads`);
}

/** Waits for the next business search request issued by the UI to complete. */
export function nextSearch(page: Page) {
  return page.waitForResponse((r) => r.url().includes('/api/businesses?') && r.request().method() === 'GET');
}

/** Waits until the list reflects a settled search (no placeholder/loading opacity). */
export async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(resultsList(page).locator('xpath=..')).not.toHaveClass(/opacity-60/);
}

export function toast(page: Page, text: string | RegExp): Locator {
  return page.locator('[data-sonner-toast]').filter({ hasText: text });
}

/** Opens a business by deep link (also the "shared URL" flow). */
export async function openBusiness(page: Page, b: Pick<BusinessSummary, 'id' | 'lat' | 'lng'>, zoom = 16) {
  await openApp(page, `c=${b.lat},${b.lng}&z=${zoom}&sel=${b.id}`);
  await expect(drawer(page)).toBeVisible();
}
