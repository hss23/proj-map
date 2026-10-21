'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Keyboard, ListTodo, Map as MapIcon, Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, Kbd, Popover, PopoverContent, PopoverTrigger, Tip } from '@/components/ui';
import { DEMO_AGENTS } from '@/lib/constants';
import { useQueue } from '@/lib/queries';
import { currentAgent, useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

export function Header() {
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setHelpOpen = useUi((s) => s.setHelpOpen);
  const leftCollapsed = useUi((s) => s.leftCollapsed);
  const toggleLeft = useUi((s) => s.toggleLeft);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <header className="relative z-[700] flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:h-16 md:gap-3 md:border-0 md:bg-bg">
      <Tip label={leftCollapsed ? 'Show results panel' : 'Hide results panel'}>
        <Button variant="outline" size="icon" className="hidden rounded-full md:inline-flex" onClick={toggleLeft} aria-label="Toggle results panel">
          {leftCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </Tip>
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-brand text-white shadow-sm dark:text-[#17141f]">
          <MapIcon className="size-[18px]" />
        </span>
        <div className="hidden whitespace-nowrap leading-tight sm:block">
          <div className="text-[15px] font-bold tracking-tight">Map Search</div>
          <div className="text-[11px] text-muted">Sales Cockpit</div>
        </div>
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="mx-auto flex h-10 min-w-0 w-full max-w-md items-center gap-2 rounded-full border border-border bg-surface-2 px-4 text-sm text-muted transition-colors hover:border-brand/40 md:bg-surface md:shadow-[var(--shadow-card)]"
        aria-label="Search businesses (command palette)"
      >
        <Search className="size-4" />
        <span className="truncate">Jump to a business…</span>
        <span className="ml-auto hidden gap-1 sm:flex">
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <QueueButton />
      <Tip label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
        <Button variant="outline" size="icon" className="hidden size-10 rounded-full sm:inline-flex" onClick={toggleTheme} aria-label="Toggle dark mode">
          {theme === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </Tip>
      <Tip label="Keyboard shortcuts" kbd="?">
        <Button variant="outline" size="icon" className="hidden size-10 rounded-full md:inline-flex" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts">
          <Keyboard />
        </Button>
      </Tip>
      <AgentSwitcher />
    </header>
  );
}

function QueueButton() {
  const openDrawer = useUi((s) => s.openDrawer);
  const drawer = useUi((s) => s.drawer);
  const closeDrawer = useUi((s) => s.closeDrawer);
  const { data } = useQueue();
  const count = data?.length ?? 0;
  const prev = useRef(count);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (count > prev.current) setPulse((p) => p + 1);
    prev.current = count;
  }, [count]);

  return (
    <Tip label="My queue" kbd="Q">
      <Button
        variant={drawer === 'queue' ? 'secondary' : 'outline'}
        className="relative h-10 gap-2 rounded-full px-4"
        onClick={() => (drawer === 'queue' ? closeDrawer() : openDrawer('queue'))}
        aria-label={`My queue, ${count} leads`}
      >
        <ListTodo />
        <span className="hidden sm:inline">Queue</span>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={pulse}
            initial={pulse ? { scale: 1.6 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
            className={cn(
              'grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-bold tabular-nums',
              count ? 'bg-brand text-white dark:text-[#17141f]' : 'bg-surface-2 text-muted',
            )}
          >
            {count}
          </motion.span>
        </AnimatePresence>
      </Button>
    </Tip>
  );
}

function AgentSwitcher() {
  const agentId = useUi((s) => s.agentId);
  const setAgent = useUi((s) => s.setAgent);
  const map = useUi((s) => s.map);
  const agent = currentAgent(agentId);
  const [open, setOpen] = useState(false);
  const initials = (name: string) => name.split(' ').map((p) => p[0]).join('');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 hover:bg-surface-2 md:border md:border-border md:bg-surface md:shadow-[var(--shadow-card)]"
          aria-label={`Signed in as ${agent.name}. Switch agent`}
        >
          <span className="grid size-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: agent.color }} aria-hidden>
            {initials(agent.name)}
          </span>
          <span className="hidden whitespace-nowrap text-left leading-tight lg:block">
            <span className="block text-sm font-semibold">{agent.name}</span>
            <span className="block text-[11px] text-muted">{agent.territory}</span>
          </span>
          <ChevronDown className="size-3.5 text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="px-2 pb-2 pt-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Demo: switch agent</div>
          <p className="mt-0.5 text-[11px] text-muted">Mock sign-in. Each agent has their own queue; claims are visible to everyone.</p>
        </div>
        {DEMO_AGENTS.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setAgent(a.id);
              setOpen(false);
              map?.flyTo([a.home.lat, a.home.lng], 14, { duration: 0.8 });
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-surface-2"
          >
            <span className="grid size-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: a.color }} aria-hidden>
              {initials(a.name)}
            </span>
            <span className="flex-1 leading-tight">
              <span className="block text-sm font-medium">{a.name}</span>
              <span className="block text-[11px] text-muted">{a.territory}</span>
            </span>
            {a.id === agentId && <Check className="size-4 text-brand" aria-label="current agent" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
