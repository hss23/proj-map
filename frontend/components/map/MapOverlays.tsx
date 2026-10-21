'use client';

import { AnimatePresence, motion } from 'framer-motion';
import L from 'leaflet';
import { ChevronDown, Expand, House, Info, Layers, LocateFixed, Maximize, Minus, Plus, RefreshCw, Route, Shrink } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Tip } from '@/components/ui';
import { TIER_META } from '@/lib/constants';
import { useBusinessSearch, useQueue } from '@/lib/queries';
import { currentAgent, useUi } from '@/lib/store';
import { cn } from '@/lib/utils';

const sameBbox = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const pill = 'pointer-events-auto flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur';

/** Top-centre: "Search as I move the map" toggle, or a "Search this area" button when it's off and the map moved. */
export function SearchAreaControl() {
  const searchAsMove = useUi((s) => s.searchAsMove);
  const setSearchAsMove = useUi((s) => s.setSearchAsMove);
  const searchThisArea = useUi((s) => s.searchThisArea);
  const moved = useUi((s) => !!s.view && !sameBbox(s.view.bbox, s.searchBbox));
  const { isFetching } = useBusinessSearch();

  const mode = !searchAsMove && moved ? 'search' : 'toggle';
  const anim = { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[500] flex justify-center px-16">
      <AnimatePresence mode="wait" initial={false}>
        {mode === 'search' && (
          <motion.div key="btn" {...anim}>
            <Button variant="primary" className="pointer-events-auto rounded-full shadow-lg" onClick={searchThisArea}>
              <RefreshCw className={cn(isFetching && 'animate-spin')} />
              Search this area
            </Button>
          </motion.div>
        )}
        {mode === 'toggle' && (
          <motion.label key="toggle" {...anim} className={cn(pill, 'cursor-pointer')}>
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

function Ctl({ label, onClick, children, active, disabled, side = 'left' }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; disabled?: boolean; side?: 'left' | 'top' }) {
  return (
    <Tip label={label} side={side}>
      <Button
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn('size-10 rounded-none', active && 'bg-brand-soft text-brand')}
      >
        {children}
      </Button>
    </Tip>
  );
}

/** Right-edge control column (as in the reference): view tools, zoom, location, and an accent "home" (my territory). */
export function MapControls() {
  const map = useUi((s) => s.map);
  const agentId = useUi((s) => s.agentId);
  const showQueueRoute = useUi((s) => s.showQueueRoute);
  const toggleQueueRoute = useUi((s) => s.toggleQueueRoute);
  const mapStyle = useUi((s) => s.mapStyle);
  const toggleMapStyle = useUi((s) => s.toggleMapStyle);
  const leftCollapsed = useUi((s) => s.leftCollapsed);
  const drawer = useUi((s) => s.drawer);
  const { data } = useBusinessSearch();
  const { data: queue } = useQueue();
  const [locating, setLocating] = useState(false);
  const focused = leftCollapsed && !drawer;

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

  /** "Focus map": hide the side panels; again to bring the results back. */
  const toggleFocus = () => {
    const s = useUi.getState();
    if (focused) {
      if (s.leftCollapsed) s.toggleLeft();
    } else {
      if (!s.leftCollapsed) s.toggleLeft();
      if (s.drawer) useUi.setState({ drawer: null });
    }
  };

  const group = 'flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/95 shadow-md backdrop-blur [&>*+*]:border-t [&>*+*]:border-border';

  return (
    <div className="absolute bottom-6 right-3 z-[500] flex flex-col items-center gap-2">
      <div className={group}>
        <Ctl label={focused ? 'Show panels' : 'Focus map'} onClick={toggleFocus} active={focused}>
          {focused ? <Shrink /> : <Expand />}
        </Ctl>
        <Ctl label={mapStyle === 'muted' ? 'Colour map' : 'Muted map'} onClick={toggleMapStyle} active={mapStyle === 'color'}>
          <Layers />
        </Ctl>
        <Ctl label={showQueueRoute ? 'Hide my queue on the map' : 'Show my queue as a route'} onClick={toggleQueueRoute} active={showQueueRoute} disabled={!queue?.length}>
          <Route />
        </Ctl>
        <Ctl label="Fit map to results" onClick={fitResults} disabled={!data?.items.length}>
          <Maximize />
        </Ctl>
      </div>
      <div className={group}>
        <Ctl label="Zoom in" onClick={() => map?.zoomIn()}>
          <Plus />
        </Ctl>
        <Ctl label="Zoom out" onClick={() => map?.zoomOut()}>
          <Minus />
        </Ctl>
      </div>
      <div className={group}>
        <Ctl label="Locate me" onClick={locate}>
          <LocateFixed className={cn(locating && 'animate-pulse text-brand')} />
        </Ctl>
      </div>
      <Tip label="My territory" side="left">
        <button
          aria-label="Go to my territory"
          onClick={() => flyHome()}
          className="grid size-12 place-items-center rounded-full bg-brand text-white shadow-lg transition-transform hover:scale-105 active:scale-95 dark:text-[#17141f]"
        >
          <House className="size-5" />
        </button>
      </Tip>
    </div>
  );
}

export function Legend() {
  const [open, setOpen] = useState(true);
  const tag = (color: string, n: number, extra?: string) => (
    <span className="inline-flex h-5 items-center gap-1 rounded-full border bg-white pl-0.5 pr-1.5 text-[10px] font-bold text-[#1d1a24]" style={{ borderColor: `color-mix(in srgb, ${color} 55%, #fff)` }}>
      <span className="size-3.5 rounded-full" style={{ background: color }} />
      {n}
      {extra}
    </span>
  );
  return (
    <div className="absolute bottom-6 left-3 z-[500] w-56 rounded-2xl border border-border bg-surface/95 text-xs shadow-md backdrop-blur">
      <button className="flex w-full items-center gap-2 px-3 py-2 font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Info className="size-3.5 text-muted" />
        Legend
        <ChevronDown className={cn('ml-auto size-3.5 transition-transform', !open && '-rotate-90')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <ul className="space-y-1.5 px-3 pb-3">
              <li className="pb-0.5 text-muted">Tags show the lead score</li>
              {(['hot', 'warm', 'cool'] as const).map((t) => (
                <li key={t} className="flex items-center gap-2">
                  {tag(TIER_META[t].color, t === 'hot' ? 88 : t === 'warm' ? 62 : 41)}
                  {TIER_META[t].label} <span className="text-muted">{t === 'hot' ? '75+' : t === 'warm' ? '50–74' : '<50'}</span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                {tag('#e8590c', 80, ' ★')}
                In your queue
              </li>
              <li className="flex items-center gap-2">
                {tag('#9ca3af', 70)}
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
