'use client';

import { Building2, CalendarClock, CircleHelp, Loader2, PhoneCall, Signal, Users, type LucideIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui';
import { TIER_META, tierOf } from '@/lib/constants';
import { useBusiness } from '@/lib/queries';
import type { BusinessSummary, ScoreBreakdown, ScoreFactor } from '@/lib/types';
import { cn, relativeDays } from '@/lib/utils';

export const FACTOR_META: Record<ScoreFactor, { label: string; icon: LucideIcon }> = {
  size: { label: 'Company size', icon: Users },
  telus: { label: 'TELUS relationship', icon: Signal },
  renewal: { label: 'Contract renewal', icon: CalendarClock },
  contact: { label: 'Contact history', icon: PhoneCall },
  industry: { label: 'Industry fit', icon: Building2 },
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** The strongest positive factors, i.e. what makes this lead hot (or not). */
export function topDrivers(b: ScoreBreakdown, n = 2) {
  return [...b.factors].filter((f) => f.points > 0).sort((x, y) => y.points - x.points).slice(0, n);
}

/** "company size (+28) and contract renewal (+25)" */
export function driversPhrase(b: ScoreBreakdown): string | null {
  const d = topDrivers(b);
  if (!d.length) return null;
  return d.map((f) => `${FACTOR_META[f.factor].label.toLowerCase()} (${signed(f.points)})`).join(' and ');
}

/** "Hot mainly because of company size (+28) and contract renewal (+25)." */
export function ScoreSummary({ breakdown }: { breakdown: ScoreBreakdown }) {
  const tier = tierOf(breakdown.total);
  const phrase = driversPhrase(breakdown);
  if (!phrase) return <p className="text-[13px] leading-snug text-muted">No strong buying signals yet.</p>;
  return (
    <p className="text-[13px] leading-snug">
      <span className="font-semibold" style={{ color: TIER_META[tier].color }}>
        {TIER_META[tier].label}
      </span>{' '}
      mainly because of {phrase}.
    </p>
  );
}

/**
 * Line-by-line score: starting score + each factor's points = lead score. Every factor is
 * listed (even at 0 or negative), so the agent sees what is and isn't helping.
 */
export function ScoreBreakdownView({
  breakdown,
  compact = false,
  showSummary = true,
}: {
  breakdown: ScoreBreakdown;
  compact?: boolean;
  /** The drawer renders its own summary next to the score ring. */
  showSummary?: boolean;
}) {
  const tier = tierOf(breakdown.total);

  return (
    <div className="space-y-3">
      {showSummary && <ScoreSummary breakdown={breakdown} />}

      <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border" aria-label="Score breakdown">
        <li className="flex items-center justify-between bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <span>Starting score</span>
          <span className="font-semibold tabular-nums text-fg">{breakdown.base}</span>
        </li>
        {breakdown.factors.map((f) => {
          const meta = FACTOR_META[f.factor];
          const Icon = meta.icon;
          const pct = f.max > 0 ? Math.max(0, f.points) / f.max : 0;
          const tone =
            f.points > 0 ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-500/10' : f.points < 0 ? 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-500/10' : 'text-muted bg-surface-2';
          return (
            <li key={f.factor} className={cn('flex items-start gap-2.5 px-3', compact ? 'py-2' : 'py-2.5')}>
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{meta.label}</span>
                <span className="block text-[13px] leading-snug">{f.label}</span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span
                    className={cn('block h-full rounded-full', f.points < 0 ? 'bg-rose-400' : 'bg-emerald-500')}
                    style={{ width: `${f.points < 0 ? 100 : pct * 100}%` }}
                  />
                </span>
              </span>
              <span
                className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums', tone)}
                aria-label={`${signed(f.points)} of ${f.max} possible points`}
                title={`${signed(f.points)} of ${f.max} possible`}
              >
                {signed(f.points)}
              </span>
            </li>
          );
        })}
        <li className="flex items-center justify-between px-3 py-2.5">
          <span className="text-sm font-semibold">Lead score</span>
          <span className="flex items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `color-mix(in srgb, ${TIER_META[tier].color} 15%, transparent)`, color: TIER_META[tier].color }}>
              {TIER_META[tier].label}
            </span>
            <span className="text-lg font-bold tabular-nums" style={{ color: TIER_META[tier].color }}>
              {breakdown.total}
            </span>
          </span>
        </li>
      </ol>
      <p className="text-[11px] text-muted">
        Scored {relativeDays(breakdown.scoredAt)}. Hot is 75+, warm 50–74.
        {breakdown.raw !== breakdown.total && ` Raw total ${breakdown.raw} is capped to 0–100.`}
      </p>
    </div>
  );
}

/**
 * The score on a result card, as a button: opens the breakdown in a popover without leaving
 * the list. Detail is fetched only when opened (and cached for the drawer).
 */
export function ScoreWhy({ b, variant }: { b: BusinessSummary; variant: 'number' | 'pill' }) {
  const color = TIER_META[tierOf(b.leadScore)].color;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={`Why is ${b.name} scored ${b.leadScore}?`}
          title="See why: score breakdown"
          className={cn(
            'group/why inline-flex items-center gap-0.5 rounded-full tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
            variant === 'number'
              ? 'px-1 text-[15px] font-bold leading-none hover:bg-surface-2'
              : 'px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ring-border hover:ring-brand/40',
          )}
          style={{ color }}
        >
          {b.leadScore}
          <CircleHelp className="size-3 opacity-50 transition-opacity group-hover/why:opacity-100" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-semibold">{b.name}</div>
          <div className="shrink-0 text-xs text-muted">Score breakdown</div>
        </div>
        <ScoreBreakdownLoader id={b.id} />
      </PopoverContent>
    </Popover>
  );
}

function ScoreBreakdownLoader({ id }: { id: number }) {
  const { data, isPending, isError, refetch } = useBusiness(id);
  if (isPending) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted" role="status">
        <Loader2 className="size-4 animate-spin" /> Loading breakdown…
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-4 text-center text-xs">
        Couldn&apos;t load the breakdown.{' '}
        <button className="font-semibold text-brand underline" onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }
  return <ScoreBreakdownView breakdown={data.scoreBreakdown} compact />;
}
