'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, GripVertical, ListTodo, MessageSquarePlus, Route, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { RenewalBadge, ScorePill } from '@/components/badges';
import { Button, Segmented, Skeleton, Tip } from '@/components/ui';
import { PRIORITY_META } from '@/lib/constants';
import { useQueue, useRemoveFromQueue, useReorderQueue, useUpdateQueueItem } from '@/lib/queries';
import { useUi } from '@/lib/store';
import type { Priority, QueueItem } from '@/lib/types';
import { cn } from '@/lib/utils';

export function QueuePanel({ onClose }: { onClose?: () => void }) {
  const { data: items, isPending, isError, refetch } = useQueue();
  const reorder = useReorderQueue();
  const showRoute = useUi((s) => s.showQueueRoute);
  const toggleRoute = useUi((s) => s.toggleQueueRoute);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!items || !over || active.id === over.id) return;
    const from = items.findIndex((i) => i.businessId === active.id);
    const to = items.findIndex((i) => i.businessId === over.id);
    reorder.mutate(arrayMove(items, from, to).map((i) => i.businessId));
  };

  const counts = (items ?? []).reduce<Record<Priority, number>>((acc, i) => ({ ...acc, [i.priority]: acc[i.priority] + 1 }), { high: 0, medium: 0, low: 0 });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <ListTodo className="size-4 text-brand" />
        <h2 className="text-sm font-semibold">My queue</h2>
        <span className="rounded-full bg-surface-2 px-2 text-xs font-medium tabular-nums text-muted">{items?.length ?? 0}</span>
        {onClose && (
          <Tip label="Close" kbd="Esc">
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Close queue" onClick={onClose}>
              <X />
            </Button>
          </Tip>
        )}
      </div>

      {!!items?.length && (
        <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs">
          {(['high', 'medium', 'low'] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-muted">
              <span className={cn('size-2 rounded-full', PRIORITY_META[p].dot)} />
              <span className="tabular-nums font-semibold text-fg">{counts[p]}</span> {PRIORITY_META[p].label.toLowerCase()}
            </span>
          ))}
          <Button
            variant={showRoute ? 'secondary' : 'ghost'}
            size="sm"
            className="ml-auto"
            aria-pressed={showRoute}
            onClick={toggleRoute}
          >
            <Route /> {showRoute ? 'Hide route' : 'Show on map'}
          </Button>
        </div>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-3">
        {isPending ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-6 text-center text-sm">
            <AlertTriangle className="mx-auto mb-2 size-6 text-rose-500" />
            Couldn&apos;t load your queue.
            <div className="mt-3">
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          </div>
        ) : !items.length ? (
          <EmptyQueue />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.businessId)} strategy={verticalListSortingStrategy}>
              <ol className="space-y-2" aria-label="Queue, in calling order">
                <AnimatePresence initial={false}>
                  {items.map((item, idx) => (
                    <QueueRow key={item.businessId} item={item} index={idx} />
                  ))}
                </AnimatePresence>
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>
      {!!items?.length && (
        <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted">
          Drag <GripVertical className="inline size-3" /> to reorder, or focus the handle and use Space + arrow keys.
        </p>
      )}
    </div>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        <ListTodo className="size-7" />
      </div>
      <div className="mt-1 text-sm font-semibold">Your queue is empty</div>
      <p className="text-xs text-muted">
        Hover a business in the list and press <strong>+</strong>, or open one and choose <strong>Add to my queue</strong>. Hot leads
        renewing soon are a great place to start.
      </p>
    </div>
  );
}

function QueueRow({ item, index }: { item: QueueItem; index: number }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.businessId });
  const select = useUi((s) => s.select);
  const isSelected = useUi((s) => s.selectedId === item.businessId);
  const remove = useRemoveFromQueue();
  const update = useUpdateQueueItem();
  const [editingNote, setEditingNote] = useState(false);
  const b = item.business;

  return (
    <motion.li
      ref={setNodeRef}
      layout={!isDragging}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -16, height: 0, marginTop: 0 }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group relative rounded-xl border bg-surface',
        isDragging ? 'z-10 border-brand shadow-xl' : isSelected ? 'border-brand/60' : 'border-border',
      )}
    >
      <div className="flex items-start gap-1 p-2.5 pl-1">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${b.name}, position ${index + 1}`}
          className="mt-1 grid h-8 w-6 shrink-0 cursor-grab touch-none place-items-center rounded text-muted hover:bg-surface-2 hover:text-fg active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="mt-1.5 grid size-6 shrink-0 place-items-center rounded-md bg-brand text-[11px] font-bold text-white dark:text-[#17141f]">{index + 1}</span>
        <div className="min-w-0 flex-1 pl-1.5">
          <button className="block w-full text-left" onClick={() => select(b.id, { fly: b })}>
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold hover:text-brand">{b.name}</span>
              <ScorePill score={b.leadScore} />
            </div>
            <div className="truncate text-xs text-muted">
              {b.subCategory} · {b.address}
            </div>
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Segmented<Priority>
              label={`Priority for ${b.name}`}
              size="sm"
              value={item.priority}
              onChange={(priority) => update.mutate({ businessId: b.id, patch: { priority }, name: b.name })}
              options={(['high', 'medium', 'low'] as const).map((p) => ({ value: p, label: PRIORITY_META[p].label, className: PRIORITY_META[p].className }))}
            />
            <RenewalBadge contractEndDate={b.contractEndDate} provider={b.competitorProvider} />
          </div>
          {editingNote ? (
            <NoteEditor
              initial={item.note ?? ''}
              onDone={(note) => {
                setEditingNote(false);
                if (note !== (item.note ?? '')) update.mutate({ businessId: b.id, patch: { note }, name: b.name });
              }}
            />
          ) : item.note ? (
            <button onClick={() => setEditingNote(true)} className="mt-2 block w-full rounded-md bg-surface-2 px-2 py-1 text-left text-xs hover:bg-border/60">
              {item.note}
            </button>
          ) : (
            <button
              onClick={() => setEditingNote(true)}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted opacity-100 hover:text-brand md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
            >
              <MessageSquarePlus className="size-3" /> Add note
            </button>
          )}
        </div>
        <Tip label="Remove from queue" side="left">
          <Button variant="danger" size="icon-sm" aria-label={`Remove ${b.name} from queue`} onClick={() => remove.mutate(item)}>
            <Trash2 />
          </Button>
        </Tip>
      </div>
    </motion.li>
  );
}

function NoteEditor({ initial, onDone }: { initial: string; onDone: (note: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = (note: string) => {
    if (done.current) return; // blur can fire after Enter/Escape already finished
    done.current = true;
    onDone(note);
  };
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="mt-2">
      <textarea
        ref={ref}
        value={value}
        maxLength={500}
        rows={2}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => finish(value.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            finish(value.trim());
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            finish(initial);
          }
        }}
        placeholder="e.g. Ask for Dana, office manager. Best before 10am."
        className="w-full resize-none rounded-md border border-border bg-surface px-2 py-1.5 text-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        aria-label="Note"
      />
      <div className="flex justify-between text-[10px] text-muted">
        <span>Enter to save · Esc to cancel</span>
        <span>{value.length}/500</span>
      </div>
    </div>
  );
}
