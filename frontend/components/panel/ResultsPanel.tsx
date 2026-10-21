'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, LayoutGrid, List, Loader2, Lock, MapPin, MapPinOff, Plus, RotateCw, Signal, Star, Users, X, ZoomOut } from 'lucide-react';
import { createElement, memo, useEffect, useRef, useState } from 'react';
import { ClaimBadge, IndustryTile, RenewalBadge } from '@/components/badges';
import { ScoreWhy } from '@/components/detail/ScoreBreakdown';
import { Button, Skeleton, Tip } from '@/components/ui';
import { industryIcon, TIER_META, tierOf } from '@/lib/constants';
import { keys, useAddToQueue, useBusinessSearch, useRemoveFromQueue } from '@/lib/queries';
import { type ResultsView, useUi } from '@/lib/store';
import type { BusinessSummary, QueueItem } from '@/lib/types';
import { activeFilterCount } from '@/lib/urlState';
import { cn, formatDistance } from '@/lib/utils';
import { ActiveFilters, FilterPopovers, KeywordInput, PresetChips } from './FilterBar';
import { SortMenu } from './SortMenu';

/**
 * Results for the current area. On desktop the keyword + filter pills live in the top toolbar,
 * so this panel is just "where am I, how many, how sorted" + the results. On mobile (bottom
 * sheet) there's no toolbar, so `withFilters` brings them in here.
 */
export function ResultsPanel({ className, withFilters = false }: { className?: string; withFilters?: boolean }) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {withFilters && (
        <div className="space-y-2.5 border-b border-border p-3">
          <KeywordInput />
          <FilterPopovers />
        </div>
      )}
      <ResultsHeader />
      <ResultsList />
    </div>
  );
}

/** "Downtown & Gastown" or "Downtown, Yaletown +3 more": the reference's "Search result <place>". */
export function areaTitle(items: BusinessSummary[]): string {
  if (!items.length) return 'This area';
  const counts = new Map<string, number>();
  for (const b of items) counts.set(b.neighbourhood, (counts.get(b.neighbourhood) ?? 0) + 1);
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2} more`;
}

function ResultsHeader() {
  const { data, isPending, isError } = useBusinessSearch();

  return (
    <div className="space-y-3 px-4 pb-3 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] leading-tight">
            <span className="text-muted">Results in </span>
            <strong className="font-semibold">{isPending ? '…' : areaTitle(data?.items ?? [])}</strong>
          </h2>
          <div className="mt-1 text-xs text-muted" aria-live="polite" aria-atomic>
            {isPending || isError ? (
              ' '
            ) : (
              <>
                <span className="font-semibold text-fg tabular-nums">{data?.total ?? 0}</span> businesses in this area
              </>
            )}
          </div>
        </div>
        <ViewToggle />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PresetChips />
        <SortMenu className="ml-auto" />
      </div>
      <ActiveFilters />
    </div>
  );
}

function ViewToggle() {
  const view = useUi((s) => s.resultsView);
  const setView = useUi((s) => s.setResultsView);
  const item = (v: ResultsView, label: string, icon: React.ReactNode) => (
    <Tip label={label}>
      <button
        aria-label={label}
        aria-pressed={view === v}
        onClick={() => setView(v)}
        className={cn('grid size-7 place-items-center rounded-full transition-colors', view === v ? 'bg-surface text-brand shadow-sm' : 'text-muted hover:text-fg')}
      >
        {icon}
      </button>
    </Tip>
  );
  return (
    <div className="flex shrink-0 rounded-full bg-surface-2 p-0.5" role="group" aria-label="Results layout">
      {item('grid', 'Grid view', <LayoutGrid className="size-3.5" />)}
      {item('list', 'List view', <List className="size-3.5" />)}
    </div>
  );
}

function ResultsList() {
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useBusinessSearch();
  const filters = useUi((s) => s.filters);
  const resetFilters = useUi((s) => s.resetFilters);
  const map = useUi((s) => s.map);
  const view = useUi((s) => s.resultsView);

  if (isPending) {
    return (
      <div className={cn('gap-3 p-4 pt-1', view === 'grid' ? 'grid grid-cols-2' : 'flex flex-col')} aria-busy>
        <div className="col-span-2">
          <SlowLoadHint />
        </div>
        {Array.from({ length: 6 }, (_, i) =>
          view === 'grid' ? (
            <div key={i} className="overflow-hidden rounded-2xl border border-border">
              <Skeleton className="h-20 rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ) : (
            <div key={i} className="flex gap-3 rounded-2xl border border-border p-3">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ),
        )}
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
    <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 pb-4 transition-opacity', isPlaceholderData && 'opacity-60')}>
      <ul className={cn(view === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-2')} aria-label="Businesses">
        {data.items.map((b) => (view === 'grid' ? <GridCard key={b.id} b={b} /> : <ResultCard key={b.id} b={b} />))}
      </ul>
      {data.truncated && (
        <p className="mt-3 rounded-xl bg-surface-2 p-2.5 text-center text-xs text-muted">
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

/**
 * "In your queue" indicator that doubles as a remove button: ★ (grid) / ✓ (list) at rest,
 * a red ✕ on hover or keyboard focus. Uses the same optimistic remove + Undo toast as the queue panel.
 */
function QuickRemove({ b, round }: { b: BusinessSummary; round: boolean }) {
  const remove = useRemoveFromQueue();
  const qc = useQueryClient();
  const agentId = useUi((s) => s.agentId);

  const onRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Look the item up at click time (keeps position/priority/note for Undo) instead of
    // subscribing every card to the queue.
    const queued = qc.getQueryData<{ items: QueueItem[] }>(keys.queue(agentId))?.items.find((i) => i.businessId === b.id);
    remove.mutate(
      queued ?? {
        businessId: b.id,
        position: 0,
        priority: b.claim.status === 'mine' ? b.claim.priority : 'medium',
        note: null,
        createdAt: '',
        updatedAt: '',
        business: b,
      },
    );
  };

  return (
    <Tip label="In your queue · click to remove" side="left">
      <button
        aria-label={`Remove ${b.name} from my queue`}
        disabled={remove.isPending}
        onClick={onRemove}
        className={cn(
          'group/qr grid size-8 place-items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400',
          round
            ? 'rounded-full bg-white/90 text-[#4b286d] shadow-sm backdrop-blur hover:bg-rose-500 hover:text-white focus-visible:bg-rose-500 focus-visible:text-white'
            : 'rounded-lg bg-brand-soft text-brand hover:bg-rose-100 hover:text-rose-600 focus-visible:bg-rose-100 focus-visible:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-300',
        )}
      >
        <span className="group-hover/qr:hidden group-focus-visible/qr:hidden">
          {round ? <Star className="size-4 fill-current" aria-hidden /> : <Check className="size-4" aria-hidden />}
        </span>
        <X className="hidden size-4 group-hover/qr:block group-focus-visible/qr:block" aria-hidden />
      </button>
    </Tip>
  );
}

/** Covers the whole card; content above it is pointer-events-none except nested controls. */
const STRETCHED = 'absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

/** Hover/selection sync shared by both card layouts. */
function useCardSync(b: BusinessSummary) {
  const isSelected = useUi((s) => s.selectedId === b.id);
  const hoverFromMap = useUi((s) => s.hovered?.id === b.id && s.hovered.source === 'map');
  const select = useUi((s) => s.select);
  const setHovered = useUi((s) => s.setHovered);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (hoverFromMap || isSelected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [hoverFromMap, isSelected]);
  return {
    ref,
    isSelected,
    hoverFromMap,
    liProps: {
      'data-business-id': b.id,
      onMouseEnter: () => setHovered({ id: b.id, source: 'list' }),
      onMouseLeave: () => setHovered(null),
    },
    buttonProps: {
      onClick: () => select(b.id, { fly: b }),
      onFocus: () => setHovered({ id: b.id, source: 'list' }),
      onBlur: () => setHovered(null),
      'aria-label': `${b.name}, ${b.subCategory}, lead score ${b.leadScore}`,
    },
  };
}

const providerLabel = (b: BusinessSummary) =>
  b.telusStatus === 'none'
    ? (b.competitorProvider ?? 'No TELUS')
    : b.telusStatus === 'mobility+internet'
      ? 'TELUS (full)'
      : `TELUS ${b.telusStatus === 'mobility' ? 'Mobility' : 'Internet'}`;

/** Grid card in the reference's style: cover, title + accent score, location, icon facts row. */
export const GridCard = memo(function GridCard({ b }: { b: BusinessSummary }) {
  const { ref, isSelected, hoverFromMap, liProps, buttonProps } = useCardSync(b);
  const tier = tierOf(b.leadScore);
  const color = b.claim.status === 'other' ? '#9ca3af' : TIER_META[tier].color;

  return (
    <li
      ref={ref}
      {...liProps}
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-surface shadow-[var(--shadow-card)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        isSelected ? 'border-brand ring-2 ring-brand/25' : hoverFromMap ? 'border-brand/60' : 'border-border',
      )}
    >
      {/* Stretched button: the whole card opens the business; the score and quick-add sit above it. */}
      <button className={STRETCHED} {...buttonProps} />
      <div className="pointer-events-none relative">
        <div
          className="relative h-20 overflow-hidden"
          style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${color} 30%, var(--surface)) 0%, color-mix(in srgb, ${color} 8%, var(--surface)) 100%)` }}
          aria-hidden
        >
          <span className="absolute -bottom-3 -right-2 opacity-25 transition-transform duration-300 group-hover:scale-110" style={{ color }}>
            {createElement(industryIcon(b.industry), { className: 'size-20', strokeWidth: 1.5 })}
          </span>
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-[#1d1a24] backdrop-blur">
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {b.claim.status === 'other' ? 'Claimed' : `${TIER_META[tier].label} lead`}
          </span>
          {b.claim.status !== 'unclaimed' && (
            <span className="absolute bottom-2 left-2">
              <ClaimBadge claim={b.claim} compact />
            </span>
          )}
        </div>
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-semibold leading-snug">{b.name}</span>
            <span className="pointer-events-auto -mr-1 -mt-0.5 shrink-0">
              <ScoreWhy b={b} variant="number" />
            </span>
          </div>
          <div className="mt-1 truncate text-[11px] text-muted">
            {b.subCategory} · {b.address}
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">
              {b.neighbourhood}
              {b.distanceKm !== undefined && ` · ${formatDistance(b.distanceKm)}`}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1" title="Employees">
              <Users className="size-3" aria-hidden />
              {b.employeeCount}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1" title="Current provider">
              <Signal className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{providerLabel(b)}</span>
            </span>
            <RenewalBadge contractEndDate={b.contractEndDate} provider={b.competitorProvider} />
          </div>
        </div>
      </div>
      <div className="absolute right-2 top-2">
        <QuickAdd b={b} round />
      </div>
    </li>
  );
});

/** Dense list row, for scanning many results quickly. */
export const ResultCard = memo(function ResultCard({ b }: { b: BusinessSummary }) {
  const { ref, isSelected, hoverFromMap, liProps, buttonProps } = useCardSync(b);

  return (
    <li
      ref={ref}
      {...liProps}
      className={cn(
        'group relative rounded-2xl border bg-surface transition-all',
        isSelected ? 'border-brand ring-2 ring-brand/20' : hoverFromMap ? 'border-brand/50 bg-brand-soft/50' : 'border-border hover:border-brand/40 hover:shadow-sm',
        b.claim.status === 'other' && 'opacity-75',
      )}
    >
      <button className={STRETCHED} {...buttonProps} />
      <div className="pointer-events-none relative flex w-full gap-3 p-3 pr-12 text-left">
        <IndustryTile industry={b.industry} score={b.leadScore} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 truncate text-sm font-semibold">{b.name}</div>
            <span className="pointer-events-auto shrink-0">
              <ScoreWhy b={b} variant="pill" />
            </span>
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
      </div>
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <QuickAdd b={b} />
      </div>
    </li>
  );
});

export function QuickAdd({ b, round = false }: { b: BusinessSummary; round?: boolean }) {
  const add = useAddToQueue();
  const shape = round ? 'size-8 rounded-full bg-white/90 shadow-sm backdrop-blur text-[#4b286d]' : 'size-8 rounded-lg';
  if (b.claim.status === 'mine') return <QuickRemove b={b} round={round} />;
  if (b.claim.status === 'other') {
    return (
      <Tip label={`Claimed by ${b.claim.agentName}`} side="left">
        <span className={cn('grid place-items-center text-muted', round && 'size-8 rounded-full bg-white/80 text-[#6b7280]', !round && 'size-8 rounded-lg')}>
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
        className={cn(
          round ? `${shape} hover:bg-white` : 'size-8',
          'opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100',
        )}
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
