'use client';

import { AlertTriangle, ArrowDownUp, Check, Loader2, Lock, MapPinOff, Plus, RotateCw, ZoomOut } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { ClaimBadge, IndustryTile, RenewalBadge, ScorePill } from '@/components/badges';
import { Button, Skeleton, Tip } from '@/components/ui';
import { SORT_LABEL } from '@/lib/constants';
import { useAddToQueue, useBusinessSearch } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { BusinessSummary, SortKey } from '@/lib/types';
import { activeFilterCount } from '@/lib/urlState';
import { cn, formatDistance } from '@/lib/utils';
import { ActiveFilters, FilterPopovers, KeywordInput, PresetChips } from './FilterBar';

export function ResultsPanel({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-2.5 border-b border-border p-3">
        <KeywordInput />
        <PresetChips />
        <FilterPopovers />
        <ActiveFilters />
      </div>
      <ResultsHeader />
      <ResultsList />
    </div>
  );
}

function ResultsHeader() {
  const { data, isPending, isError } = useBusinessSearch();
  const sort = useUi((s) => s.sort);
  const setSort = useUi((s) => s.setSort);

  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
      <div className="text-xs text-muted" aria-live="polite" aria-atomic>
        {isPending || isError ? (
          ' '
        ) : (
          <>
            <span className="font-semibold text-fg tabular-nums">{data?.total ?? 0}</span> businesses in this area
          </>
        )}
      </div>
      <label className="relative inline-flex items-center gap-1 text-xs text-muted">
        <ArrowDownUp className="size-3.5" aria-hidden />
        <span className="sr-only">Sort by</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="cursor-pointer appearance-none bg-transparent pr-1 font-medium text-fg focus:outline-none"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((s) => (
            <option key={s} value={s}>
              {SORT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function ResultsList() {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useBusinessSearch();
  const filters = useUi((s) => s.filters);
  const resetFilters = useUi((s) => s.resetFilters);
  const map = useUi((s) => s.map);

  if (isPending) {
    return (
      <div className="space-y-2 p-3" aria-busy>
        <SlowLoadHint />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border p-3">
            <Skeleton className="size-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<AlertTriangle className="size-6 text-rose-500" />}
        title="Couldn't load businesses"
        body={error instanceof Error ? error.message : 'Unknown error'}
        action={
          <Button variant="primary" onClick={() => refetch()}>
            <RotateCw /> Try again
          </Button>
        }
      />
    );
  }

  if (!data.items.length) {
    const hasFilters = activeFilterCount(filters) > 0;
    return (
      <EmptyState
        icon={<MapPinOff className="size-6 text-muted" />}
        title="No businesses match here"
        body={hasFilters ? 'Try removing a filter or zooming out to widen the area.' : 'Zoom out or pan the map to find businesses.'}
        action={
          <div className="flex gap-2">
            {hasFilters && (
              <Button variant="secondary" onClick={resetFilters}>
                Clear filters
              </Button>
            )}
            <Button onClick={() => map?.zoomOut(2)}>
              <ZoomOut /> Zoom out
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3 transition-opacity', isPlaceholderData && 'opacity-60')}>
      <ul className="space-y-2 pt-1" aria-label="Businesses">
        {data.items.map((b) => (
          <ResultCard key={b.id} b={b} />
        ))}
      </ul>
      {data.truncated && (
        <p className="mt-3 rounded-lg bg-surface-2 p-2.5 text-center text-xs text-muted">
          Showing the top {data.items.length} of {data.total}. Zoom in or add filters to see the rest.
        </p>
      )}
    </div>
  );
}

/** Shown only if loading drags on, which on free hosting means the API is waking from sleep. */
function SlowLoadHint() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!slow) return null;
  return (
    <div role="status" className="flex items-start gap-2.5 rounded-xl bg-brand-soft p-3 text-xs text-brand">
      <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
      <span>
        <strong className="block font-semibold">Waking up the server…</strong>
        The demo runs on free hosting that sleeps when idle. The first load can take up to a minute.
      </span>
    </div>
  );
}

function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-surface-2">{icon}</div>
      <div className="mt-1 text-sm font-semibold">{title}</div>
      <p className="max-w-[16rem] text-xs text-muted">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export const ResultCard = memo(function ResultCard({ b }: { b: BusinessSummary }) {
  const isSelected = useUi((s) => s.selectedId === b.id);
  const hoverFromMap = useUi((s) => s.hovered?.id === b.id && s.hovered.source === 'map');
  const select = useUi((s) => s.select);
  const setHovered = useUi((s) => s.setHovered);
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (hoverFromMap || isSelected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [hoverFromMap, isSelected]);

  return (
    <li
      ref={ref}
      data-business-id={b.id}
      onMouseEnter={() => setHovered({ id: b.id, source: 'list' })}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        'group relative rounded-xl border bg-surface transition-all',
        isSelected ? 'border-brand ring-2 ring-brand/20' : hoverFromMap ? 'border-brand/50 bg-brand-soft/50' : 'border-border hover:border-brand/40 hover:shadow-sm',
        b.claim.status === 'other' && 'opacity-75',
      )}
    >
      <button
        className="flex w-full gap-3 p-3 pr-12 text-left"
        onClick={() => select(b.id, { fly: b })}
        onFocus={() => setHovered({ id: b.id, source: 'list' })}
        onBlur={() => setHovered(null)}
        aria-label={`${b.name}, ${b.subCategory}, lead score ${b.leadScore}`}
      >
        <IndustryTile industry={b.industry} score={b.leadScore} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{b.name}</div>
            <ScorePill score={b.leadScore} />
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {b.subCategory} · {b.address}
            {b.distanceKm !== undefined && <span className="whitespace-nowrap"> · {formatDistance(b.distanceKm)}</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            <RenewalBadge contractEndDate={b.contractEndDate} provider={b.competitorProvider} />
            {b.telusStatus === 'none' && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">{b.competitorProvider ?? 'No TELUS'}</span>
            )}
            <ClaimBadge claim={b.claim} compact />
          </div>
        </div>
      </button>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <QuickAdd b={b} />
      </div>
    </li>
  );
});

export function QuickAdd({ b }: { b: BusinessSummary }) {
  const add = useAddToQueue();
  if (b.claim.status === 'mine') {
    return (
      <Tip label="In your queue" side="left">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand">
          <Check className="size-4" />
        </span>
      </Tip>
    );
  }
  if (b.claim.status === 'other') {
    return (
      <Tip label={`Claimed by ${b.claim.agentName}`} side="left">
        <span className="grid size-8 place-items-center rounded-lg text-muted">
          <Lock className="size-4" />
        </span>
      </Tip>
    );
  }
  return (
    <Tip label="Add to my queue" side="left" kbd="A">
      <Button
        variant="secondary"
        size="icon"
        className="size-8 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
        aria-label={`Add ${b.name} to my queue`}
        disabled={add.isPending}
        onClick={(e) => {
          e.stopPropagation();
          add.mutate({ business: b });
        }}
      >
        <Plus />
      </Button>
    </Tip>
  );
}
