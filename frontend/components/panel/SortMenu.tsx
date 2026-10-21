'use client';

import * as Menu from '@radix-ui/react-dropdown-menu';
import { ArrowDownAZ, ArrowDownUp, CalendarClock, Check, ChevronDown, Navigation, TrendingUp, type LucideIcon } from 'lucide-react';
import { SORT_LABEL } from '@/lib/constants';
import { useUi } from '@/lib/store';
import type { SortKey } from '@/lib/types';
import { cn } from '@/lib/utils';

const OPTIONS: Array<{ value: SortKey; icon: LucideIcon; hint: string }> = [
  { value: 'score', icon: TrendingUp, hint: 'Best opportunities first' },
  { value: 'distance', icon: Navigation, hint: 'Nearest to the centre of the area' },
  { value: 'renewal', icon: CalendarClock, hint: 'Competitor contracts ending soonest' },
  { value: 'name', icon: ArrowDownAZ, hint: 'Alphabetical' },
];

/**
 * Themed sort dropdown. It replaces a native <select>, whose OS-drawn option list ignored the
 * app theme (white-on-white in dark mode). Radix gives arrow-key navigation, typeahead,
 * Esc to close and focus return.
 */
export function SortMenu({ className }: { className?: string }) {
  const sort = useUi((s) => s.sort);
  const setSort = useUi((s) => s.setSort);

  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button
          aria-label={`Sort by: ${SORT_LABEL[sort]}`}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium text-fg transition-colors hover:bg-surface-2 data-[state=open]:border-brand/50 data-[state=open]:ring-2 data-[state=open]:ring-brand/20',
            className,
          )}
        >
          <ArrowDownUp className="size-3.5 text-muted" aria-hidden />
          <span className="text-muted">Sort:</span>
          {SORT_LABEL[sort]}
          <ChevronDown className="size-3.5 text-muted transition-transform [[data-state=open]_&]:rotate-180" aria-hidden />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[1100] w-72 rounded-xl border border-border bg-surface p-1.5 text-fg shadow-xl outline-none"
        >
          <Menu.Label className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Sort results by</Menu.Label>
          <Menu.RadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            {OPTIONS.map(({ value, icon: Icon, hint }) => (
              <Menu.RadioItem
                key={value}
                value={value}
                className="group flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 outline-none transition-colors data-[highlighted]:bg-surface-2 data-[state=checked]:bg-brand-soft"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted group-data-[state=checked]:bg-surface group-data-[state=checked]:text-brand">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium group-data-[state=checked]:text-brand">{SORT_LABEL[value]}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
                <Menu.ItemIndicator>
                  <Check className="size-4 text-brand" aria-hidden />
                </Menu.ItemIndicator>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
