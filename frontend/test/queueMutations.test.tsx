import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keys, useAddToQueue, useRemoveFromQueue } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { BusinessSummary, QueueItem, SearchResponse } from '@/lib/types';

const toastMock = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const AGENT = 'agent-alex';
const business: BusinessSummary = {
  id: 7,
  name: "Joe's Café",
  industry: 'Restaurants & Food',
  subCategory: 'Café',
  address: '1 Main St',
  city: 'Vancouver',
  lat: 49.28,
  lng: -123.12,
  employeeCount: 12,
  employeeBand: '10-49',
  telusStatus: 'none',
  competitorProvider: 'Rogers',
  contractEndDate: null,
  leadScore: 80,
  claim: { status: 'unclaimed' },
};
const searchKey = [...keys.businesses(AGENT), 'bbox', 'filters', 'score'];

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  qc.setQueryData(keys.queue(AGENT), { items: [] as QueueItem[] });
  qc.setQueryData<SearchResponse>(searchKey, { items: [business], total: 1, truncated: false, facets: { industry: {} } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
}

function mockFetchOnce(status: number, body: unknown) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      await gate; // hold the response so we can observe the optimistic state
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
  return release;
}

beforeEach(() => {
  useUi.setState({ agentId: AGENT });
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

describe('useAddToQueue (optimistic)', () => {
  it('shows the lead as mine immediately, then rolls back on 409 ALREADY_CLAIMED', async () => {
    const { qc, wrapper } = setup();
    const release = mockFetchOnce(409, {
      error: { code: 'ALREADY_CLAIMED', message: 'Already claimed by Sam Chen', details: { claimedBy: { id: 'agent-sam', name: 'Sam Chen' } } },
    });
    const { result } = renderHook(() => useAddToQueue(), { wrapper });

    act(() => result.current.mutate({ business, priority: 'high' }));

    // Optimistic: queued + marked mine before the server answers.
    await waitFor(() => expect(qc.getQueryData<{ items: QueueItem[] }>(keys.queue(AGENT))?.items).toHaveLength(1));
    expect(qc.getQueryData<SearchResponse>(searchKey)?.items[0].claim).toEqual({ status: 'mine', priority: 'high' });

    release();
    await waitFor(() => expect(result.current.isError).toBe(true));

    // Rolled back everywhere, and the agent is told who beat them to it.
    expect(qc.getQueryData<{ items: QueueItem[] }>(keys.queue(AGENT))?.items).toHaveLength(0);
    expect(qc.getQueryData<SearchResponse>(searchKey)?.items[0].claim).toEqual({ status: 'unclaimed' });
    expect(toastMock.error).toHaveBeenCalledWith("Joe's Café was just claimed by Sam Chen", expect.anything());
  });
});

describe('useRemoveFromQueue', () => {
  it('removes optimistically and offers Undo', async () => {
    const { qc, wrapper } = setup();
    const item: QueueItem = {
      businessId: 7,
      position: 0,
      priority: 'high',
      note: 'call at 9',
      createdAt: '',
      updatedAt: '',
      business: { ...business, claim: { status: 'mine', priority: 'high' } },
    };
    qc.setQueryData(keys.queue(AGENT), { items: [item] });
    const release = mockFetchOnce(204, null);
    const { result } = renderHook(() => useRemoveFromQueue(), { wrapper });

    act(() => result.current.mutate(item));
    await waitFor(() => expect(qc.getQueryData<{ items: QueueItem[] }>(keys.queue(AGENT))?.items).toHaveLength(0));

    release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastMock).toHaveBeenCalledWith("Removed Joe's Café", expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }));
  });
});
