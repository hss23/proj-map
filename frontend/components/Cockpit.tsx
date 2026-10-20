'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Toaster } from 'sonner';
import { setAuthToken } from '@/lib/api';
import { useAddToQueue, useBusinessSearch, useQueue } from '@/lib/queries';
import { currentAgent, useUi } from '@/lib/store';
import { serializeUrlState } from '@/lib/urlState';
import { cn, debounce, isTypingTarget } from '@/lib/utils';
import { BottomSheet } from './BottomSheet';
import { CommandPalette } from './CommandPalette';
import { BusinessDetailView } from './detail/BusinessDetailView';
import { Header } from './Header';
import { FetchingBar, Legend, MapControls, SearchAreaControl } from './map/MapOverlays';
import MapView from './map/MapView';
import { ResultsPanel } from './panel/ResultsPanel';
import { QueuePanel } from './queue/QueuePanel';
import { ShortcutsDialog } from './ShortcutsDialog';
import { TooltipProvider } from './ui';

// Mock auth: the bearer token follows the selected demo agent.
setAuthToken(currentAgent(useUi.getState().agentId).token);
useUi.subscribe((s, prev) => {
  if (s.agentId !== prev.agentId) setAuthToken(currentAgent(s.agentId).token);
});

export default function Cockpit() {
  const theme = useUi((s) => s.theme);
  const leftCollapsed = useUi((s) => s.leftCollapsed);
  const drawer = useUi((s) => s.drawer);
  const selectedId = useUi((s) => s.selectedId);
  const closeDrawer = useUi((s) => s.closeDrawer);
  const map = useUi((s) => s.map);
  const mapBox = useRef<HTMLDivElement>(null);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  useThemeClass(theme);
  useUrlSync();
  useKeyboardShortcuts();

  // Leaflet must be told when its container changes size (panels opening/closing).
  useEffect(() => {
    if (!map || !mapBox.current) return;
    const ro = new ResizeObserver(() => map.invalidateSize({ debounceMoveend: true }));
    ro.observe(mapBox.current);
    return () => ro.disconnect();
  }, [map]);

  const showDrawer = drawer === 'queue' || (drawer === 'details' && selectedId !== null);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col overflow-hidden">
        <Header />
        <div className="relative flex min-h-0 flex-1">
          {/* Left: filters + results (desktop/tablet) */}
          {isDesktop && !leftCollapsed && (
            <aside className="flex w-[380px] shrink-0 border-r border-border bg-surface" aria-label="Search results">
              <ResultsPanel className="w-full" />
            </aside>
          )}

          {/* Centre: map */}
          <main ref={mapBox} className="relative min-w-0 flex-1" aria-label="Map">
            <MapView />
            <FetchingBar />
            <SearchAreaControl />
            <MapControls />
            <div className="hidden lg:block">
              <Legend />
            </div>
          </main>

          {/* Right: details / queue drawer (desktop/tablet) */}
          <AnimatePresence initial={false}>
            {isDesktop && showDrawer && (
              <motion.aside
                key="drawer"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute inset-y-0 right-0 z-[650] w-[420px] max-w-[85vw] border-l border-border bg-surface shadow-2xl lg:static lg:shrink-0 lg:shadow-none"
                aria-label={drawer === 'queue' ? 'My queue' : 'Business details'}
              >
                <DrawerTabs />
                <div className="h-[calc(100%-44px)]">
                  {drawer === 'queue' ? <QueuePanel onClose={closeDrawer} /> : <BusinessDetailView onClose={closeDrawer} />}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile: bottom sheet with Results / Details / Queue */}
        {!isDesktop && <BottomSheet />}
      </div>

      <CommandPalette />
      <ShortcutsDialog />
      <Toaster position="bottom-center" richColors closeButton theme={theme} toastOptions={{ className: 'font-sans' }} />
    </TooltipProvider>
  );
}

function DrawerTabs() {
  const drawer = useUi((s) => s.drawer);
  const selectedId = useUi((s) => s.selectedId);
  const openDrawer = useUi((s) => s.openDrawer);
  const { data: queue } = useQueue();
  const tab = (id: 'details' | 'queue', label: React.ReactNode, disabled = false) => (
    <button
      role="tab"
      aria-selected={drawer === id}
      disabled={disabled}
      onClick={() => openDrawer(id)}
      className={cn(
        'relative h-11 flex-1 text-sm font-medium transition-colors disabled:opacity-40',
        drawer === id ? 'text-brand' : 'text-muted hover:text-fg',
      )}
    >
      {label}
      {drawer === id && <motion.span layoutId="drawer-tab" className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-brand" />}
    </button>
  );
  return (
    <div role="tablist" className="flex border-b border-border">
      {tab('details', 'Details', selectedId === null)}
      {tab('queue', `My queue (${queue?.length ?? 0})`)}
    </div>
  );
}

function useThemeClass(theme: 'light' | 'dark') {
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
}

/** Mirrors shareable state into the URL (replaceState, so Back isn't spammed by every pan). */
function useUrlSync() {
  useEffect(() => {
    const write = debounce(() => {
      const s = useUi.getState();
      const qs = serializeUrlState({
        filters: s.filters,
        sort: s.sort,
        center: s.view?.center ?? null,
        zoom: s.view?.zoom ?? null,
        selectedId: s.selectedId,
      });
      window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
    }, 400);
    const unsub = useUi.subscribe((s, prev) => {
      if (s.filters !== prev.filters || s.sort !== prev.sort || s.view !== prev.view || s.selectedId !== prev.selectedId) write();
    });
    return () => {
      unsub();
      write.cancel();
    };
  }, []);
}

function useKeyboardShortcuts() {
  const { data } = useBusinessSearch();
  const add = useAddToQueue();
  const latest = useRef({ items: data?.items ?? [], add });
  useEffect(() => {
    latest.current = { items: data?.items ?? [], add };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useUi.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        s.setPaletteOpen(!s.paletteOpen);
        return;
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      // Let open popovers (filters, agent switcher) own the keyboard; tooltips don't count.
      if (s.paletteOpen || s.helpOpen || document.querySelector('[data-radix-popper-content-wrapper] [role="dialog"]')) return;

      const { items, add } = latest.current;
      const idx = items.findIndex((b) => b.id === s.selectedId);
      const step = (delta: number) => {
        const next = items[idx < 0 ? 0 : Math.min(Math.max(idx + delta, 0), items.length - 1)];
        if (next) s.select(next.id, { fly: next });
      };

      switch (e.key) {
        case '/': {
          e.preventDefault();
          if (s.leftCollapsed) s.toggleLeft();
          requestAnimationFrame(() => document.getElementById('keyword-filter')?.focus());
          break;
        }
        case '?':
          s.setHelpOpen(true);
          break;
        case 'Escape':
          if (s.drawer) s.closeDrawer();
          break;
        case 'j':
          step(1);
          break;
        case 'k':
          step(-1);
          break;
        case 'a': {
          const b = items[idx];
          if (b && b.claim.status === 'unclaimed') add.mutate({ business: b });
          break;
        }
        case 'q':
          if (s.drawer === 'queue') s.closeDrawer();
          else s.openDrawer('queue');
          break;
        case 'r':
          s.toggleQueueRoute();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => true,
  );
}
