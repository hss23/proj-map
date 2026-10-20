import type {
  ApiErrorBody,
  BBox,
  BusinessDetail,
  BusinessSummary,
  FilterMeta,
  Filters,
  Priority,
  QueueItem,
  SearchResponse,
  SortKey,
} from './types';

/** Error carrying the API's stable `code`, so the UI can react to e.g. ALREADY_CLAIMED. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string) {
  authToken = token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...init.headers,
      },
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (body as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'HTTP_ERROR', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return body as T;
}

export interface SearchArgs {
  bbox: BBox;
  filters: Filters;
  sort: SortKey;
  center: { lat: number; lng: number };
}

export function buildSearchParams({ bbox, filters, sort, center }: SearchArgs): URLSearchParams {
  const p = new URLSearchParams();
  p.set('bbox', [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat].map((n) => n.toFixed(5)).join(','));
  if (filters.q.trim()) p.set('q', filters.q.trim());
  if (filters.industry.length) p.set('industry', filters.industry.join(','));
  if (filters.employeeBand.length) p.set('employeeBand', filters.employeeBand.join(','));
  if (filters.telusStatus.length) p.set('telusStatus', filters.telusStatus.join(','));
  if (filters.minScore !== null) p.set('minScore', String(filters.minScore));
  if (filters.renewalWithinDays !== null) p.set('renewalWithinDays', String(filters.renewalWithinDays));
  if (filters.claim !== 'all') p.set('claim', filters.claim);
  p.set('sort', sort);
  p.set('center', `${center.lng.toFixed(5)},${center.lat.toFixed(5)}`);
  p.set('limit', '300');
  return p;
}

export const api = {
  meta: () => request<FilterMeta>('/meta/filters'),
  search: (args: SearchArgs, signal?: AbortSignal) =>
    request<SearchResponse>(`/businesses?${buildSearchParams(args)}`, { signal }),
  suggest: (q: string, signal?: AbortSignal) =>
    request<{ items: BusinessSummary[] }>(`/businesses/suggest?q=${encodeURIComponent(q)}&limit=8`, { signal }),
  business: (id: number, signal?: AbortSignal) => request<BusinessDetail>(`/businesses/${id}`, { signal }),
  queue: (signal?: AbortSignal) => request<{ items: QueueItem[] }>('/queue', { signal }),
  addToQueue: (body: { businessId: number; priority?: Priority; note?: string | null; position?: number }) =>
    request<QueueItem>('/queue', { method: 'POST', body: JSON.stringify(body) }),
  updateQueueItem: (businessId: number, patch: { priority?: Priority; note?: string | null }) =>
    request<QueueItem>(`/queue/${businessId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  reorderQueue: (businessIds: number[]) =>
    request<{ items: QueueItem[] }>('/queue/order', { method: 'PUT', body: JSON.stringify({ businessIds }) }),
  removeFromQueue: (businessId: number) => request<void>(`/queue/${businessId}`, { method: 'DELETE' }),
};
