'use client';

import { Command } from 'cmdk';
import { Crosshair, Eraser, Keyboard, ListTodo, Loader2, Moon, Search, Sun } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ClaimBadge, IndustryTile, ScorePill } from '@/components/badges';
import { Kbd } from '@/components/ui';
import { INDUSTRY_ICONS, industryIcon } from '@/lib/constants';
import { useSuggest } from '@/lib/queries';
import { currentAgent, useUi } from '@/lib/store';

/** Highlights each query token inside `text`. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  if (!tokens?.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-brand-soft px-0.5 text-brand">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  // Mounted only while open, so the query and selection reset each time.
  return open ? <PaletteDialog /> : null;
}

function PaletteDialog() {
  const setOpen = useUi((s) => s.setPaletteOpen);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 150);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching } = useSuggest(q);
  const industries = useMemo(
    () => Object.keys(INDUSTRY_ICONS).filter((i) => q && i.toLowerCase().includes(q.toLowerCase())),
    [q],
  );

  // Results arrive asynchronously, so keep the first one highlighted for Enter-to-jump.
  const firstValue = q ? (data?.items[0] ? `b-${data.items[0].id}` : industries[0] ? `i-${industries[0]}` : '') : 'queue';
  const [selected, setSelected] = useState(firstValue);
  const [prevFirst, setPrevFirst] = useState(firstValue);
  if (prevFirst !== firstValue) {
    setPrevFirst(firstValue);
    setSelected(firstValue);
  }

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const ui = useUi.getState;

  const itemCls =
    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-brand-soft aria-selected:text-fg data-[disabled=true]:opacity-50';
  const groupCls =
    '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted';

  return (
    <Command.Dialog
      open
      onOpenChange={setOpen}
      label="Search businesses and commands"
      shouldFilter={false}
      value={selected}
      onValueChange={setSelected}
      overlayClassName="fixed inset-0 z-[1300] bg-black/40 backdrop-blur-[2px]"
      contentClassName="fixed left-1/2 top-[12vh] z-[1301] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface text-fg shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        {isFetching ? <Loader2 className="size-4 animate-spin text-muted" /> : <Search className="size-4 text-muted" />}
        <Command.Input
          value={input}
          onValueChange={setInput}
          placeholder="Jump to a business anywhere, or filter by industry…"
          className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
        />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
        {q && !isFetching && !data?.items.length && !industries.length && (
          <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No businesses or industries match “{q}”.</Command.Empty>
        )}

        {!!data?.items.length && q && (
          <Command.Group heading="Businesses" className={groupCls}>
            {data.items.map((b) => (
              <Command.Item key={b.id} value={`b-${b.id}`} className={itemCls} onSelect={() => run(() => ui().select(b.id, { fly: b }))}>
                <IndustryTile industry={b.industry} score={b.leadScore} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    <Highlight text={b.name} query={q} />
                  </div>
                  <div className="truncate text-xs text-muted">
                    {b.subCategory} · {b.address}, {b.city}
                  </div>
                </div>
                <ClaimBadge claim={b.claim} compact />
                <ScorePill score={b.leadScore} />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {!!industries.length && (
          <Command.Group heading="Filter by industry" className={groupCls}>
            {industries.map((ind) => {
              const Icon = industryIcon(ind);
              return (
                <Command.Item key={ind} value={`i-${ind}`} className={itemCls} onSelect={() => run(() => ui().setFilters({ industry: [ind] }))}>
                  <Icon className="size-4 text-muted" />
                  <span>
                    Show only <strong>{ind}</strong>
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {!q && (
          <Command.Group heading="Actions" className={groupCls}>
            <Command.Item value="queue" className={itemCls} onSelect={() => run(() => ui().openDrawer('queue'))}>
              <ListTodo className="size-4 text-muted" /> Open my queue <Kbd className="ml-auto">Q</Kbd>
            </Command.Item>
            <Command.Item
              value="territory"
              className={itemCls}
              onSelect={() =>
                run(() => {
                  const a = currentAgent(ui().agentId);
                  ui().map?.flyTo([a.home.lat, a.home.lng], 14);
                })
              }
            >
              <Crosshair className="size-4 text-muted" /> Go to my territory
            </Command.Item>
            <Command.Item value="clear" className={itemCls} onSelect={() => run(() => ui().resetFilters())}>
              <Eraser className="size-4 text-muted" /> Clear all filters
            </Command.Item>
            <Command.Item value="theme" className={itemCls} onSelect={() => run(() => ui().toggleTheme())}>
              {ui().theme === 'dark' ? <Sun className="size-4 text-muted" /> : <Moon className="size-4 text-muted" />} Toggle dark mode
            </Command.Item>
            <Command.Item value="help" className={itemCls} onSelect={() => run(() => ui().setHelpOpen(true))}>
              <Keyboard className="size-4 text-muted" /> Keyboard shortcuts <Kbd className="ml-auto">?</Kbd>
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
