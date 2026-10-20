'use client';

import * as Slider from '@radix-ui/react-slider';
import { ChevronDown, Flame, Hourglass, Search, Target, UserRoundCheck, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CheckRow, Popover, PopoverContent, PopoverTrigger, Segmented } from '@/components/ui';
import { BAND_LABEL, DEFAULT_FILTERS, RENEWAL_OPTIONS, TELUS_STATUS_LABEL, industryIcon } from '@/lib/constants';
import { useBusinessSearch, useMeta } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { ClaimFilter, EmployeeBand, Filters, TelusStatus } from '@/lib/types';
import { activeFilterCount } from '@/lib/urlState';
import { cn, debounce } from '@/lib/utils';

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

// ------------------------------------------------------------------ Keyword
export function KeywordInput() {
  const q = useUi((s) => s.filters.q);
  const setFilters = useUi((s) => s.setFilters);
  const [value, setValue] = useState(q);
  const [prevQ, setPrevQ] = useState(q);
  const push = useMemo(() => debounce((v: string) => setFilters({ q: v }), 300), [setFilters]);

  // Keep in sync when changed from elsewhere (chips, "Clear all", URL).
  if (prevQ !== q) {
    setPrevQ(q);
    setValue(q);
  }
  useEffect(() => () => push.cancel(), [push]);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        id="keyword-filter"
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          push(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue('');
            push.cancel();
            setFilters({ q: '' });
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder="Filter this area: name, category, street…"
        aria-label="Filter businesses in this area by keyword"
        maxLength={100}
        className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-9 text-sm placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          aria-label="Clear keyword"
          className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
          onClick={() => {
            setValue('');
            push.cancel();
            setFilters({ q: '' });
          }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Presets
const PRESETS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isOn: (f: Filters) => boolean;
  on: Partial<Filters>;
  off: Partial<Filters>;
}> = [
  { id: 'hot', label: 'Hot leads', icon: Flame, isOn: (f) => (f.minScore ?? 0) >= 75, on: { minScore: 75 }, off: { minScore: null } },
  { id: 'renew', label: 'Renewing ≤ 90d', icon: Hourglass, isOn: (f) => f.renewalWithinDays !== null && f.renewalWithinDays <= 90, on: { renewalWithinDays: 90 }, off: { renewalWithinDays: null } },
  { id: 'prospect', label: 'Not TELUS', icon: Target, isOn: (f) => f.telusStatus.length === 1 && f.telusStatus[0] === 'none', on: { telusStatus: ['none'] }, off: { telusStatus: [] } },
  { id: 'open', label: 'Unclaimed', icon: UserRoundCheck, isOn: (f) => f.claim === 'unclaimed', on: { claim: 'unclaimed' }, off: { claim: 'all' } },
];

export function PresetChips() {
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick filters">
      {PRESETS.map((p) => {
        const on = p.isOn(filters);
        const Icon = p.icon;
        return (
          <button
            key={p.id}
            aria-pressed={on}
            onClick={() => setFilters(on ? p.off : p.on)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
              on ? 'border-brand bg-brand text-white dark:text-[#17141f]' : 'border-border bg-surface text-fg hover:border-brand/50 hover:bg-brand-soft',
            )}
          >
            <Icon className="size-3.5" />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ Filter popovers
function FilterButton({ label, count, children, wide }: { label: string; count: number; children: React.ReactNode; wide?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors data-[state=open]:ring-2 data-[state=open]:ring-brand/20',
            count ? 'border-brand/50 bg-brand-soft text-brand' : 'border-border bg-surface hover:bg-surface-2',
          )}
        >
          {label}
          {count > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-white dark:text-[#17141f]">{count}</span>}
          <ChevronDown className="size-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className={wide ? 'w-80' : undefined}>{children}</PopoverContent>
    </Popover>
  );
}

function PopoverHeader({ title, onClear, canClear }: { title: string; onClear: () => void; canClear: boolean }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</div>
      <button className="text-xs font-medium text-brand disabled:opacity-0" disabled={!canClear} onClick={onClear}>
        Clear
      </button>
    </div>
  );
}

export function FilterPopovers() {
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const { data: meta } = useMeta();
  const { data } = useBusinessSearch();
  const facets = data?.facets.industry ?? {};
  const industries = meta?.industries ?? Object.keys(facets);
  const moreCount = (filters.minScore !== null ? 1 : 0) + (filters.renewalWithinDays !== null ? 1 : 0) + (filters.claim !== 'all' ? 1 : 0);

  return (
    <div className="flex flex-wrap gap-1.5">
      <FilterButton label="Industry" count={filters.industry.length} wide>
        <PopoverHeader title="Industry" canClear={filters.industry.length > 0} onClear={() => setFilters({ industry: [] })} />
        <div className="scrollbar-thin -mx-1 max-h-72 overflow-y-auto">
          {[...industries]
            .sort((a, b) => (facets[b] ?? 0) - (facets[a] ?? 0))
            .map((ind) => {
              const Icon = industryIcon(ind);
              return (
                <CheckRow
                  key={ind}
                  checked={filters.industry.includes(ind)}
                  onChange={() => setFilters({ industry: toggle(filters.industry, ind) })}
                  count={facets[ind] ?? 0}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="size-3.5 text-muted" />
                    {ind}
                  </span>
                </CheckRow>
              );
            })}
        </div>
        <p className="mt-2 text-[11px] text-muted">Counts are for the current map area.</p>
      </FilterButton>

      <FilterButton label="Size" count={filters.employeeBand.length}>
        <PopoverHeader title="Employees" canClear={filters.employeeBand.length > 0} onClear={() => setFilters({ employeeBand: [] })} />
        <div className="grid grid-cols-2 gap-1.5">
          {(meta?.employeeBands ?? (Object.keys(BAND_LABEL) as EmployeeBand[])).map((band) => {
            const on = filters.employeeBand.includes(band);
            return (
              <button
                key={band}
                aria-pressed={on}
                onClick={() => setFilters({ employeeBand: toggle(filters.employeeBand, band) })}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-surface-2',
                )}
              >
                {BAND_LABEL[band]}
              </button>
            );
          })}
        </div>
      </FilterButton>

      <FilterButton label="TELUS status" count={filters.telusStatus.length}>
        <PopoverHeader title="Current TELUS services" canClear={filters.telusStatus.length > 0} onClear={() => setFilters({ telusStatus: [] })} />
        {(meta?.telusStatuses ?? (Object.keys(TELUS_STATUS_LABEL) as TelusStatus[])).map((s) => (
          <CheckRow key={s} checked={filters.telusStatus.includes(s)} onChange={() => setFilters({ telusStatus: toggle(filters.telusStatus, s) })}>
            {TELUS_STATUS_LABEL[s]}
          </CheckRow>
        ))}
      </FilterButton>

      <FilterButton label="More" count={moreCount} wide>
        <PopoverHeader
          title="More filters"
          canClear={moreCount > 0}
          onClear={() => setFilters({ minScore: null, renewalWithinDays: null, claim: 'all' })}
        />
        <div className="space-y-4">
          <ScoreSlider value={filters.minScore} onChange={(v) => setFilters({ minScore: v })} />
          <div>
            <div className="mb-1.5 text-sm font-medium">Competitor contract ends within</div>
            <div className="flex flex-wrap gap-1.5">
              {RENEWAL_OPTIONS.map((d) => {
                const on = filters.renewalWithinDays === d;
                return (
                  <button
                    key={d}
                    aria-pressed={on}
                    onClick={() => setFilters({ renewalWithinDays: on ? null : d })}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium',
                      on ? 'border-brand bg-brand-soft text-brand' : 'border-border hover:bg-surface-2',
                    )}
                  >
                    {d < 365 ? `${d} days` : '1 year'}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-muted">Includes contracts that already expired (month-to-month).</p>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-medium">Claim status</div>
            <Segmented<ClaimFilter>
              label="Claim status"
              value={filters.claim}
              onChange={(claim) => setFilters({ claim })}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unclaimed', label: 'Unclaimed' },
                { value: 'mine', label: 'My queue' },
              ]}
            />
          </div>
        </div>
      </FilterButton>
    </div>
  );
}

function ScoreSlider({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [local, setLocal] = useState(value ?? 0);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setLocal(value ?? 0);
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium">Minimum lead score</span>
        <span className="tabular-nums text-muted">{local === 0 ? 'Any' : `${local}+`}</span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={0}
        max={95}
        step={5}
        value={[local]}
        onValueChange={([v]) => setLocal(v)}
        onValueCommit={([v]) => onChange(v === 0 ? null : v)}
        aria-label="Minimum lead score"
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-gradient-to-r from-[#5c7cfa] via-[#e0a100] to-[#e8590c]">
          <Slider.Range className="absolute h-full bg-transparent" />
        </Slider.Track>
        <Slider.Thumb className="block size-5 rounded-full border-2 border-brand bg-surface shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30" />
      </Slider.Root>
    </div>
  );
}

// ------------------------------------------------------------------ Active chips
export function ActiveFilters() {
  const filters = useUi((s) => s.filters);
  const setFilters = useUi((s) => s.setFilters);
  const resetFilters = useUi((s) => s.resetFilters);
  if (activeFilterCount(filters) === 0) return null;

  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (filters.q.trim()) chips.push({ key: 'q', label: `“${filters.q.trim()}”`, remove: () => setFilters({ q: '' }) });
  for (const i of filters.industry) chips.push({ key: `i-${i}`, label: i, remove: () => setFilters({ industry: filters.industry.filter((x) => x !== i) }) });
  for (const b of filters.employeeBand)
    chips.push({ key: `b-${b}`, label: `${BAND_LABEL[b]} employees`, remove: () => setFilters({ employeeBand: filters.employeeBand.filter((x) => x !== b) }) });
  for (const t of filters.telusStatus)
    chips.push({ key: `t-${t}`, label: TELUS_STATUS_LABEL[t], remove: () => setFilters({ telusStatus: filters.telusStatus.filter((x) => x !== t) }) });
  if (filters.minScore !== null) chips.push({ key: 'min', label: `Score ${filters.minScore}+`, remove: () => setFilters({ minScore: null }) });
  if (filters.renewalWithinDays !== null)
    chips.push({ key: 'renew', label: `Renews ≤ ${filters.renewalWithinDays}d`, remove: () => setFilters({ renewalWithinDays: null }) });
  if (filters.claim !== 'all')
    chips.push({ key: 'claim', label: filters.claim === 'mine' ? 'My queue' : 'Unclaimed', remove: () => setFilters({ claim: DEFAULT_FILTERS.claim }) });

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-2.5 pr-1 text-xs font-medium">
          {c.label}
          <button aria-label={`Remove filter ${c.label}`} onClick={c.remove} className="grid size-4 place-items-center rounded-full text-muted hover:bg-border hover:text-fg">
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button onClick={resetFilters} className="ml-1 text-xs font-semibold text-brand hover:underline">
        Clear all
      </button>
    </div>
  );
}
