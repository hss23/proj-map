import { createElement } from 'react';
import { Clock, Lock, Star } from 'lucide-react';
import { industryIcon, PRIORITY_META, TIER_META, tierOf } from '@/lib/constants';
import type { Claim } from '@/lib/types';
import { cn, renewalInfo } from '@/lib/utils';

export function ScorePill({ score, className }: { score: number; className?: string }) {
  const tier = tierOf(score);
  return (
    <span
      title={`${TIER_META[tier].label} lead: score ${score}/100`}
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset', TIER_META[tier].pill, className)}
    >
      <span className="size-1.5 rounded-full" style={{ background: TIER_META[tier].color }} aria-hidden />
      {score}
    </span>
  );
}

export function IndustryTile({ industry, score, size = 'md' }: { industry: string; score: number; size?: 'sm' | 'md' | 'lg' }) {
  const color = TIER_META[tierOf(score)].color;
  const dims = { sm: 'size-8 rounded-lg [&_svg]:size-4', md: 'size-10 rounded-xl [&_svg]:size-5', lg: 'size-12 rounded-xl [&_svg]:size-6' }[size];
  return (
    <span
      className={cn('grid shrink-0 place-items-center', dims)}
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      aria-hidden
    >
      {createElement(industryIcon(industry))}
    </span>
  );
}

export function ClaimBadge({ claim, compact }: { claim: Claim; compact?: boolean }) {
  if (claim.status === 'unclaimed') return null;
  if (claim.status === 'mine') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
        <Star className="size-3 fill-current" aria-hidden />
        {compact ? 'Queued' : 'In your queue'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-500/15 dark:text-slate-300">
      <Lock className="size-3" aria-hidden />
      {compact ? claim.agentName.split(' ')[0] : `Claimed by ${claim.agentName}`}
    </span>
  );
}

export function RenewalBadge({ contractEndDate, provider }: { contractEndDate: string | null; provider: string | null }) {
  const info = renewalInfo(contractEndDate, provider);
  if (!info || info.tone === 'later') return null;
  const tone = {
    urgent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    expired: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    soon: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
    later: '',
  }[info.tone];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tone)}>
      <Clock className="size-3" aria-hidden />
      {info.label}
    </span>
  );
}

export function PriorityDot({ priority }: { priority: keyof typeof PRIORITY_META }) {
  return <span className={cn('inline-block size-2 rounded-full', PRIORITY_META[priority].dot)} aria-hidden />;
}
