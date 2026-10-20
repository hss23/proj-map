'use client';

import { AnimatePresence, motion } from 'framer-motion';
import L from 'leaflet';
import { ChevronDown, Crosshair, Info, LocateFixed, Maximize, Minus, Plus, RefreshCw, Route } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Tip } from '@/components/ui';
import { CLAIMED_COLOR, MINE_COLOR, TIER_META } from '@/lib/constants';
import { useBusinessSearch, useQueue } from '@/lib/queries';
import { currentAgent, useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

const sameBbox = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Top-centre: "Search as I move the map" toggle, or a "Search this area" button when it's off and the map moved. */
export function SearchAreaControl() {
  const searchAsMove = useUi((s) => s.searchAsMove);
  const setSearchAsMove = useUi((s) => s.setSearchAsMove);
  const searchThisArea = useUi((s) => s.searchThisArea);
  const moved = useUi((s) => !!s.view && !sameBbox(s.view.bbox, s.searchBbox));
  const { isFetching } = useBusinessSearch();

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-16">
      <AnimatePresence mode="wait" initial={false}>
        {!searchAsMove && moved ? (
          <motion.div key="btn" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <Button variant="primary" className="pointer-events-auto rounded-full shadow-lg" onClick={searchThisArea}>
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
              Search this area
            </Button>
          </motion.div>
        ) : (
          <motion.label
            key="toggle"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="pointer-events-auto flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur"
          >
            <input
              type="checkbox"
              checked={searchAsMove}
              onChange={(e) => setSearchAsMove(e.target.checked)}
              className="size-3.5 accent-[var(--brand)]"
            />
            Search as I move the map
          </motion.label>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Slim progress bar while a search is in flight. */
export function FetchingBar() {
  const { isFetching } = useBusinessSearch();
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] h-0.5 overflow-hidden">
      <AnimatePresence>
        {isFetching && (
          <motion.div
            className="h-full w-1/3 bg-brand"
            initial={{ x: '-100%' }}
            animate={{ x: '300%' }}
            exit={{ opacity: 0 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'easeInOut' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export function MapControls() {
  const map = useUi((s) => s.map);
  const agentId = useUi((s) => s.agentId);
  const showQueueRoute = useUi((s) => s.showQueueRoute);
  const toggleQueueRoute = useUi((s) => s.toggleQueueRoute);
  const { data } = useBusinessSearch();
  const { data: queue } = useQueue();
  const [locating, setLocating] = useState(false);

  const flyHome = (reason?: string) => {
    const agent = currentAgent(agentId);
    map?.flyTo([agent.home.lat, agent.home.lng], 14, { duration: 0.8 });
    if (reason) toast.info(reason, { description: `Showing your territory: ${agent.territory}` });
  };

  const locate = () => {
    if (!map) return;
    if (!('geolocation' in navigator)) return flyHome('Location is not available in this browser');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude: lat, longitude: lng } = pos.coords;
        // Mock data only covers Metro Vancouver.
        const inCoverage = lat > 48.9 && lat < 49.5 && lng > -123.4 && lng < -122.5;
        if (inCoverage) map.flyTo([lat, lng], 15, { duration: 0.8 });
        else flyHome("You're outside the demo coverage area");
      },
      () => {
        setLocating(false);
        flyHome("Couldn't get your location");
      },
      { timeout: 8000, maximumAge: 60_000 },
    );
  };

  const fitResults = () => {
    if (!map || !data?.items.length) return;
    map.fitBounds(L.latLngBounds(data.items.map((b) => [b.lat, b.lng] as [number, number])), { padding: [48, 48], maxZoom: 16 });
  };

  const group = 'flex flex-col overflow-hidden rounded-xl border border-border bg-surface/95 shadow-md backdrop-blur [&>button]:rounded-none [&>button+button]:border-t [&>button+button]:border-border';

  return (
    <div className="absolute right-3 top-3 z-[500] flex flex-col gap-2">
      <div className={group}>
        <Tip label="Zoom in" side="left">
          <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => map?.zoomIn()}>
            <Plus />
          </Button>
        </Tip>
        <Tip label="Zoom out" side="left">
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => map?.zoomOut()}>
            <Minus />
          </Button>
        </Tip>
      </div>
      <div className={group}>
        <Tip label="Locate me" side="left">
          <Button variant="ghost" size="icon" aria-label="Locate me" onClick={locate}>
            <LocateFixed className={cn(locating && 'animate-pulse text-brand')} />
          </Button>
        </Tip>
        <Tip label="My territory" side="left">
          <Button variant="ghost" size="icon" aria-label="Go to my territory" onClick={() => flyHome()}>
            <Crosshair />
          </Button>
        </Tip>
        <Tip label="Fit to results" side="left">
          <Button variant="ghost" size="icon" aria-label="Fit map to results" onClick={fitResults} disabled={!data?.items.length}>
            <Maximize />
          </Button>
        </Tip>
      </div>
      <div className={group}>
        <Tip label={showQueueRoute ? 'Hide my queue on the map' : 'Show my queue as a route'} side="left">
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={showQueueRoute}
            aria-label="Toggle queue route"
            onClick={toggleQueueRoute}
            disabled={!queue?.length}
            className={cn(showQueueRoute && 'bg-brand-soft text-brand')}
          >
            <Route />
          </Button>
        </Tip>
      </div>
    </div>
  );
}

export function Legend() {
  const [open, setOpen] = useState(true);
  return (
    <div className="absolute bottom-6 left-3 z-[500] max-w-[15rem] rounded-xl border border-border bg-surface/95 text-xs shadow-md backdrop-blur">
      <button
        className="flex w-full items-center gap-2 px-3 py-2 font-semibold"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Info className="size-3.5 text-muted" />
        Legend
        <ChevronDown className={cn('ml-auto size-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <ul className="space-y-1.5 px-3 pb-3">
              {(['hot', 'warm', 'cool'] as const).map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="size-3 rounded-full ring-2 ring-white" style={{ background: TIER_META[t].color }} />
                  {TIER_META[t].label} lead{' '}
                  <span className="text-muted">{t === 'hot' ? '75+' : t === 'warm' ? '50–74' : '<50'}</span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="grid size-3 place-items-center rounded-full text-[8px] text-white" style={{ background: MINE_COLOR }}>★</span>
                In your queue
              </li>
              <li className="flex items-center gap-2">
                <span className="size-3 rounded-full" style={{ background: CLAIMED_COLOR }} />
                Claimed by another agent
              </li>
              <li className="flex items-center gap-2 pt-1 text-muted">
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[#2b8000] px-1 text-[9px] font-bold text-white">3</span>
                Hot leads inside a cluster
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
