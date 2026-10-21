'use client';

import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowUpRight,
  Building,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  Navigation,
  Phone,
  Users,
  Wifi,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ClaimBadge, IndustryTile } from '@/components/badges';
import { Button, Kbd, Skeleton, Tip } from '@/components/ui';
import { TELUS_STATUS_LABEL, TIER_META, tierOf } from '@/lib/constants';
import { useAddToQueue, useBusiness, useBusinessSearch, useQueue, useRemoveFromQueue, useUpdateQueueItem } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { BusinessDetail, BusinessSummary, ScoreBreakdown } from '@/lib/types';
import { cn, formatDate, relativeDays, renewalInfo } from '@/lib/utils';
import { ClaimCta } from './ClaimCta';
import { ScoreBreakdownView, ScoreSummary } from './ScoreBreakdown';

export function BusinessDetailView({ onClose }: { onClose: () => void }) {
  const selectedId = useUi((s) => s.selectedId);
  const select = useUi((s) => s.select);
  const { data: search } = useBusinessSearch();
  const { data: detail, isPending, isError, refetch } = useBusiness(selectedId);
  const { data: queue } = useQueue();
  const add = useAddToQueue();
  const remove = useRemoveFromQueue();
  const update = useUpdateQueueItem();

  const items = search?.items ?? [];
  const index = items.findIndex((b) => b.id === selectedId);
  const summary: BusinessSummary | undefined = detail ?? items[index] ?? queue?.find((q) => q.businessId === selectedId)?.business;

  const go = (delta: number) => {
    const next = items[index + delta];
    if (next) select(next.id, { fly: next });
  };

  if (selectedId === null) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar: navigation */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Tip label="Previous result" kbd="K">
          <Button variant="ghost" size="icon-sm" aria-label="Previous result" disabled={index <= 0} onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
        </Tip>
        <Tip label="Next result" kbd="J">
          <Button variant="ghost" size="icon-sm" aria-label="Next result" disabled={index < 0 || index >= items.length - 1} onClick={() => go(1)}>
            <ChevronRight />
          </Button>
        </Tip>
        <span className="ml-1 text-xs tabular-nums text-muted">{index >= 0 ? `${index + 1} of ${items.length}` : 'Not in current results'}</span>
        <Tip label="Close" kbd="Esc">
          <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close details" onClick={onClose}>
            <X />
          </Button>
        </Tip>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {!summary && isPending ? (
          <DetailSkeleton />
        ) : !summary || isError ? (
          <div className="p-6 text-center text-sm">
            <AlertCircle className="mx-auto mb-2 size-6 text-rose-500" />
            Couldn&apos;t load this business.
            <div className="mt-3">
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          </div>
        ) : (
          <motion.div key={summary.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <Header b={summary} />
            <div className="space-y-5 px-4 pb-6">
              <ScoreSection b={summary} breakdown={detail?.scoreBreakdown} />
              {detail ? <QuickActions b={detail} /> : <Skeleton className="h-16" />}
              {detail ? <Facts b={detail} /> : <Skeleton className="h-40" />}
              {detail?.notes && (
                <section>
                  <SectionTitle>CRM note</SectionTitle>
                  <p className="rounded-lg border-l-4 border-brand/40 bg-surface-2 p-3 text-sm">{detail.notes}</p>
                </section>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Sticky primary action */}
      {summary && (
        <div className="border-t border-border bg-surface p-4">
          <ClaimCta
            claim={summary.claim}
            pending={add.isPending || remove.isPending}
            onAdd={(priority) => add.mutate({ business: summary, priority })}
            onPriorityChange={(priority) => update.mutate({ businessId: summary.id, patch: { priority }, name: summary.name })}
            onRemove={() => {
              const item = queue?.find((q) => q.businessId === summary.id);
              remove.mutate(
                item ?? {
                  businessId: summary.id,
                  position: 0,
                  priority: summary.claim.status === 'mine' ? summary.claim.priority : 'medium',
                  note: null,
                  createdAt: '',
                  updatedAt: '',
                  business: summary,
                },
              );
            }}
          />
          <div className="mt-2 hidden items-center justify-center gap-1.5 text-[11px] text-muted md:flex">
            <Kbd>A</Kbd> add · <Kbd>J</Kbd>/<Kbd>K</Kbd> next/prev
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ b }: { b: BusinessSummary }) {
  return (
    <div className="flex gap-3 p-4">
      <IndustryTile industry={b.industry} score={b.leadScore} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold leading-tight">{b.name}</h2>
        <div className="mt-0.5 text-sm text-muted">
          {b.subCategory} · {b.industry}
        </div>
        <div className="mt-0.5 text-sm text-muted">
          {b.address}, {b.city}
        </div>
        {b.claim.status !== 'unclaimed' && (
          <div className="mt-2">
            <ClaimBadge claim={b.claim} />
          </div>
        )}
      </div>
    </div>
  );
}

export function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const tier = tierOf(score);
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  // Start empty, then fill on the next frame so the CSS transition animates on mount and on change.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Lead score ${score} out of 100, ${TIER_META[tier].label}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={8} className="stroke-surface-2" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          stroke={TIER_META[tier].color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown / 100)}
          style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-xl font-bold leading-none tabular-nums">{score}</div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: TIER_META[tier].color }}>
            {TIER_META[tier].label}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreSection({ b, breakdown }: { b: BusinessSummary; breakdown?: ScoreBreakdown }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface-2/50 p-3.5" aria-label="Lead score">
      <div className="flex items-center gap-4">
        <ScoreRing score={b.leadScore} />
        <div className="min-w-0 flex-1">
          <SectionTitle className="mb-1">Why it scores {b.leadScore}</SectionTitle>
          {breakdown ? (
            <ScoreSummary breakdown={breakdown} />
          ) : (
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          )}
        </div>
      </div>
      {breakdown ? <ScoreBreakdownView breakdown={breakdown} showSummary={false} /> : <Skeleton className="h-56 rounded-xl" />}
    </section>
  );
}

function QuickActions({ b }: { b: BusinessDetail }) {
  const fullAddress = `${b.address}, ${b.city}, BC ${b.postalCode}`;
  const action = 'flex flex-1 flex-col items-center gap-1 rounded-xl border border-border py-2.5 text-xs font-medium transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand disabled:opacity-40 disabled:hover:bg-transparent [&_svg]:size-4';
  return (
    <div className="flex gap-2">
      <a className={action} href={b.phone ? `tel:${b.phone.replace(/[^\d+]/g, '')}` : undefined} aria-disabled={!b.phone}>
        <Phone /> Call
      </a>
      <a className={cn(action, !b.website && 'pointer-events-none opacity-40')} href={b.website ?? undefined} target="_blank" rel="noopener noreferrer">
        <Globe /> Website
      </a>
      <button
        className={action}
        onClick={() => {
          navigator.clipboard?.writeText(fullAddress).then(
            () => toast.success('Address copied'),
            () => toast.error('Could not copy'),
          );
        }}
      >
        <Copy /> Copy
      </button>
      <a
        className={action}
        href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Navigation /> Directions
      </a>
    </div>
  );
}

function Facts({ b }: { b: BusinessDetail }) {
  const renewal = renewalInfo(b.contractEndDate, b.competitorProvider);
  const rows: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
    { icon: <Wifi />, label: 'TELUS today', value: TELUS_STATUS_LABEL[b.telusStatus] },
    {
      icon: <ArrowUpRight />,
      label: 'Competitor',
      value: b.competitorProvider ?? <span className="text-muted">None</span>,
    },
    {
      icon: <CalendarClock />,
      label: 'Contract ends',
      value: b.contractEndDate ? (
        <span>
          {formatDate(b.contractEndDate)}{' '}
          <span className={cn('text-xs', renewal?.tone === 'urgent' || renewal?.tone === 'expired' ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
            ({relativeDays(b.contractEndDate)})
          </span>
        </span>
      ) : (
        <span className="text-muted">Unknown</span>
      ),
    },
    { icon: <Users />, label: 'Employees', value: `${b.employeeCount} (${b.employeeBand})` },
    { icon: <Building />, label: 'Revenue', value: `${b.revenueBand}${b.yearEstablished ? ` · est. ${b.yearEstablished}` : ''}` },
    {
      icon: <Phone />,
      label: 'Last contacted',
      value: b.lastContactedAt ? `${relativeDays(b.lastContactedAt)}` : <span className="font-medium text-emerald-600 dark:text-emerald-400">Never</span>,
    },
  ];
  return (
    <section>
      <SectionTitle>At a glance</SectionTitle>
      <dl className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3 px-3 py-2 text-sm">
            <dt className="flex w-32 shrink-0 items-center gap-2 text-muted [&_svg]:size-3.5">
              {r.icon}
              {r.label}
            </dt>
            <dd className="min-w-0 flex-1">{r.value}</dd>
          </div>
        ))}
      </dl>
      {b.phone && <div className="mt-2 text-xs text-muted">Phone: {b.phone}</div>}
    </section>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted', className)}>{children}</h3>;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <div className="flex gap-3">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-16" />
      <Skeleton className="h-48" />
    </div>
  );
}
