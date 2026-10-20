'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import { useUi } from './store';
import type { BBox, BusinessDetail, BusinessSummary, Claim, Priority, QueueItem, SearchResponse } from './types';

export const keys = {
  meta: ['meta'] as const,
  businesses: (agentId: string) => ['businesses', agentId] as const,
  business: (agentId: string, id: number) => ['business', agentId, id] as const,
  queue: (agentId: string) => ['queue', agentId] as const,
  suggest: (agentId: string, q: string) => ['suggest', agentId, q] as const,
};

const round = (n: number) => Math.round(n * 1e4) / 1e4;
const roundBbox = (b: BBox): BBox => ({
  minLng: round(b.minLng),
  minLat: round(b.minLat),
  maxLng: round(b.maxLng),
  maxLat: round(b.maxLat),
});

export function useMeta() {
  return useQuery({ queryKey: keys.meta, queryFn: () => api.meta(), staleTime: Infinity });
}

export function useBusinessSearch() {
  const agentId = useUi((s) => s.agentId);
  const searchBbox = useUi((s) => s.searchBbox);
  const filters = useUi((s) => s.filters);
  const sort = useUi((s) => s.sort);
  const bbox = searchBbox ? roundBbox(searchBbox) : null;

  return useQuery({
    queryKey: [...keys.businesses(agentId), bbox, filters, sort],
    queryFn: ({ signal }) => {
      const b = bbox!;
      // Distances are measured from the centre of the searched area.
      const center = { lat: (b.minLat + b.maxLat) / 2, lng: (b.minLng + b.maxLng) / 2 };
      return api.search({ bbox: b, filters, sort, center }, signal);
    },
    enabled: bbox !== null,
    placeholderData: keepPreviousData, // keep pins on screen while panning
    staleTime: 15_000,
  });
}

export function useBusiness(id: number | null) {
  const agentId = useUi((s) => s.agentId);
  return useQuery({
    queryKey: keys.business(agentId, id ?? -1),
    queryFn: ({ signal }) => api.business(id!, signal),
    enabled: id !== null,
    staleTime: 15_000,
  });
}

export function useSuggest(q: string) {
  const agentId = useUi((s) => s.agentId);
  return useQuery({
    queryKey: keys.suggest(agentId, q),
    queryFn: ({ signal }) => api.suggest(q, signal),
    enabled: q.trim().length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useQueue() {
  const agentId = useUi((s) => s.agentId);
  return useQuery({
    queryKey: keys.queue(agentId),
    queryFn: ({ signal }) => api.queue(signal),
    select: (d) => d.items,
  });
}

// ---------------------------------------------------------------------------
// Optimistic mutations. Each one snapshots every cache it touches, so a failure
// (e.g. another agent claimed the lead a second earlier) rolls back cleanly.
// ---------------------------------------------------------------------------

type QueueData = { items: QueueItem[] };

function snapshot(qc: QueryClient, agentId: string, businessId: number) {
  const queue = qc.getQueryData<QueueData>(keys.queue(agentId));
  const searches = qc.getQueriesData<SearchResponse>({ queryKey: keys.businesses(agentId) });
  const detail = qc.getQueryData<BusinessDetail>(keys.business(agentId, businessId));
  return () => {
    qc.setQueryData(keys.queue(agentId), queue);
    for (const [key, data] of searches) qc.setQueryData(key, data);
    qc.setQueryData(keys.business(agentId, businessId), detail);
  };
}

export function setClaimEverywhere(qc: QueryClient, agentId: string, businessId: number, claim: Claim) {
  qc.setQueriesData<SearchResponse>({ queryKey: keys.businesses(agentId) }, (old) =>
    old ? { ...old, items: old.items.map((b) => (b.id === businessId ? { ...b, claim } : b)) } : old,
  );
  qc.setQueryData<BusinessDetail>(keys.business(agentId, businessId), (old) => (old ? { ...old, claim } : old));
}

function invalidateAfterQueueChange(qc: QueryClient, agentId: string, businessId?: number) {
  void qc.invalidateQueries({ queryKey: keys.queue(agentId) });
  void qc.invalidateQueries({ queryKey: keys.businesses(agentId) });
  if (businessId !== undefined) void qc.invalidateQueries({ queryKey: keys.business(agentId, businessId) });
}

function errorToast(err: unknown, businessName: string) {
  if (err instanceof ApiError) {
    if (err.code === 'ALREADY_CLAIMED') {
      const by = (err.details as { claimedBy?: { name: string } } | undefined)?.claimedBy?.name ?? 'another agent';
      toast.error(`${businessName} was just claimed by ${by}`, { description: 'Their claim came in first. Pick another lead nearby.' });
      return;
    }
    if (err.code === 'ALREADY_IN_QUEUE') {
      toast.info(`${businessName} is already in your queue`);
      return;
    }
    toast.error(err.message);
    return;
  }
  toast.error('Something went wrong. Please try again.');
}

export interface AddVars {
  business: BusinessSummary;
  priority?: Priority;
  note?: string | null;
  position?: number;
  /** Suppress the success toast (used by Undo). */
  silent?: boolean;
}

export function useAddToQueue() {
  const qc = useQueryClient();
  const agentId = useUi((s) => s.agentId);
  const openDrawer = useUi((s) => s.openDrawer);

  return useMutation({
    mutationFn: ({ business, priority, note, position }: AddVars) =>
      api.addToQueue({ businessId: business.id, priority, note: note ?? undefined, position }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: keys.queue(agentId) });
      const restore = snapshot(qc, agentId, vars.business.id);
      const priority = vars.priority ?? 'medium';
      qc.setQueryData<QueueData>(keys.queue(agentId), (old) => {
        const items = [...(old?.items ?? [])];
        const now = new Date().toISOString();
        const optimistic: QueueItem = {
          businessId: vars.business.id,
          position: vars.position ?? items.length,
          priority,
          note: vars.note ?? null,
          createdAt: now,
          updatedAt: now,
          business: { ...vars.business, claim: { status: 'mine', priority } },
        };
        items.splice(Math.min(vars.position ?? items.length, items.length), 0, optimistic);
        return { items };
      });
      setClaimEverywhere(qc, agentId, vars.business.id, { status: 'mine', priority });
      return { restore };
    },
    onError: (err, vars, ctx) => {
      ctx?.restore();
      errorToast(err, vars.business.name);
    },
    onSuccess: (_data, vars) => {
      if (!vars.silent) {
        toast.success(`Added ${vars.business.name} to your queue`, {
          action: { label: 'View queue', onClick: () => openDrawer('queue') },
        });
      }
    },
    onSettled: (_d, _e, vars) => invalidateAfterQueueChange(qc, agentId, vars.business.id),
  });
}

export function useRemoveFromQueue() {
  const qc = useQueryClient();
  const agentId = useUi((s) => s.agentId);
  const add = useAddToQueue();

  return useMutation({
    mutationFn: (item: QueueItem) => api.removeFromQueue(item.businessId),
    onMutate: async (item) => {
      await qc.cancelQueries({ queryKey: keys.queue(agentId) });
      const restore = snapshot(qc, agentId, item.businessId);
      qc.setQueryData<QueueData>(keys.queue(agentId), (old) =>
        old ? { items: old.items.filter((i) => i.businessId !== item.businessId) } : old,
      );
      setClaimEverywhere(qc, agentId, item.businessId, { status: 'unclaimed' });
      return { restore };
    },
    onError: (err, item, ctx) => {
      ctx?.restore();
      errorToast(err, item.business.name);
    },
    onSuccess: (_d, item) => {
      toast(`Removed ${item.business.name}`, {
        description: 'The lead is released for other agents.',
        duration: 6000,
        action: {
          label: 'Undo',
          onClick: () =>
            add.mutate({ business: item.business, priority: item.priority, note: item.note, position: item.position, silent: true }),
        },
      });
    },
    onSettled: (_d, _e, item) => invalidateAfterQueueChange(qc, agentId, item.businessId),
  });
}

export function useUpdateQueueItem() {
  const qc = useQueryClient();
  const agentId = useUi((s) => s.agentId);

  return useMutation({
    mutationFn: ({ businessId, patch }: { businessId: number; patch: { priority?: Priority; note?: string | null }; name: string }) =>
      api.updateQueueItem(businessId, patch),
    onMutate: async ({ businessId, patch }) => {
      await qc.cancelQueries({ queryKey: keys.queue(agentId) });
      const restore = snapshot(qc, agentId, businessId);
      qc.setQueryData<QueueData>(keys.queue(agentId), (old) =>
        old
          ? {
              items: old.items.map((i) =>
                i.businessId === businessId
                  ? { ...i, ...(patch.priority ? { priority: patch.priority } : {}), ...(patch.note !== undefined ? { note: patch.note || null } : {}) }
                  : i,
              ),
            }
          : old,
      );
      if (patch.priority) setClaimEverywhere(qc, agentId, businessId, { status: 'mine', priority: patch.priority });
      return { restore };
    },
    onError: (err, vars, ctx) => {
      ctx?.restore();
      errorToast(err, vars.name);
    },
    onSettled: (_d, _e, vars) => {
      void qc.invalidateQueries({ queryKey: keys.queue(agentId) });
      if (vars.patch.priority) void qc.invalidateQueries({ queryKey: keys.businesses(agentId) });
    },
  });
}

export function useReorderQueue() {
  const qc = useQueryClient();
  const agentId = useUi((s) => s.agentId);

  return useMutation({
    mutationFn: (businessIds: number[]) => api.reorderQueue(businessIds),
    onMutate: async (businessIds) => {
      await qc.cancelQueries({ queryKey: keys.queue(agentId) });
      const previous = qc.getQueryData<QueueData>(keys.queue(agentId));
      if (previous) {
        const byId = new Map(previous.items.map((i) => [i.businessId, i]));
        qc.setQueryData<QueueData>(keys.queue(agentId), {
          items: businessIds.map((id, position) => ({ ...byId.get(id)!, position })).filter((i) => i.businessId),
        });
      }
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      qc.setQueryData(keys.queue(agentId), ctx?.previous);
      toast.error(err instanceof ApiError ? err.message : 'Could not save the new order');
    },
    onSuccess: (data) => qc.setQueryData(keys.queue(agentId), data),
  });
}
