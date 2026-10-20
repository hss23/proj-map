'use client';

import { motion, type PanInfo } from 'framer-motion';
import { useEffect, useState } from 'react';
import { useQueue } from '@/lib/queries';
import { type SheetSnap, useUi } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BusinessDetailView } from './detail/BusinessDetailView';
import { ResultsPanel } from './panel/ResultsPanel';
import { QueuePanel } from './queue/QueuePanel';

/** Snap heights in px (framer-motion can't animate dvh/calc units). */
function snapHeights(vh: number): Record<SheetSnap, number> {
  return { peek: 120, half: Math.round(vh * 0.5), full: vh - 56 };
}

function useViewportHeight() {
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return vh;
}
const ORDER: SheetSnap[] = ['peek', 'half', 'full'];

/** Mobile layout: the map stays full-screen and results/details/queue live in a draggable sheet. */
export function BottomSheet() {
  const sheet = useUi((s) => s.sheet);
  const setSheet = useUi((s) => s.setSheet);
  const drawer = useUi((s) => s.drawer);
  const selectedId = useUi((s) => s.selectedId);
  const openDrawer = useUi((s) => s.openDrawer);
  const { data: queue } = useQueue();
  const heights = snapHeights(useViewportHeight());

  const tab = drawer === 'queue' ? 'queue' : drawer === 'details' && selectedId !== null ? 'details' : 'results';

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const i = ORDER.indexOf(sheet);
    if (info.offset.y < -40 || info.velocity.y < -400) setSheet(ORDER[Math.min(i + 1, 2)]);
    else if (info.offset.y > 40 || info.velocity.y > 400) setSheet(ORDER[Math.max(i - 1, 0)]);
  };

  const tabBtn = (id: typeof tab, label: string, onClick: () => void, disabled = false) => (
    <button
      role="tab"
      aria-selected={tab === id}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex-1 rounded-lg py-1.5 text-xs font-semibold disabled:opacity-40', tab === id ? 'bg-surface text-brand shadow-sm' : 'text-muted')}
    >
      {label}
    </button>
  );

  return (
    <motion.section
      className="fixed inset-x-0 bottom-0 z-[800] flex flex-col rounded-t-2xl border-t border-border bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.15)]"
      initial={false}
      animate={{ height: heights[sheet] }}
      transition={{ type: 'spring', stiffness: 380, damping: 38 }}
      aria-label="Results and queue"
    >
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.15}
        onDragEnd={onDragEnd}
        className="shrink-0 cursor-grab touch-none px-3 pb-2 pt-2"
      >
        <button
          className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-border"
          aria-label={`Resize panel (currently ${sheet})`}
          onClick={() => setSheet(ORDER[(ORDER.indexOf(sheet) + 1) % 3])}
        />
        <div role="tablist" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {tabBtn('results', 'Results', () => useUi.setState({ drawer: null, sheet: sheet === 'peek' ? 'half' : sheet }))}
          {tabBtn('details', 'Details', () => openDrawer('details'), selectedId === null)}
          {tabBtn('queue', `Queue (${queue?.length ?? 0})`, () => openDrawer('queue'))}
        </div>
      </motion.div>
      <div className="min-h-0 flex-1">
        {tab === 'results' && <ResultsPanel className="h-full" />}
        {tab === 'details' && <BusinessDetailView onClose={() => useUi.setState({ drawer: null, selectedId: null })} />}
        {tab === 'queue' && <QueuePanel />}
      </div>
    </motion.section>
  );
}
