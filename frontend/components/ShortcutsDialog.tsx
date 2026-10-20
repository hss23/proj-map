'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Kbd } from '@/components/ui';
import { useUi } from '@/lib/store';

export const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ['Ctrl', 'K'], label: 'Jump to a business / command palette' },
  { keys: ['/'], label: 'Filter results by keyword' },
  { keys: ['J'], label: 'Next result' },
  { keys: ['K'], label: 'Previous result' },
  { keys: ['A'], label: 'Add selected business to my queue' },
  { keys: ['Q'], label: 'Open my queue' },
  { keys: ['R'], label: 'Show / hide queue route on map' },
  { keys: ['Esc'], label: 'Close panel' },
  { keys: ['?'], label: 'Show this help' },
];

export function ShortcutsDialog() {
  const open = useUi((s) => s.helpOpen);
  const setOpen = useUi((s) => s.setHelpOpen);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1300] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[1301] w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-surface p-5 text-fg shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close className="grid size-7 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="Close">
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-3 text-xs text-muted">Work the map without leaving the keyboard.</Dialog.Description>
          <ul className="divide-y divide-border">
            {SHORTCUTS.map((s) => (
              <li key={s.label} className="flex items-center justify-between py-2 text-sm">
                {s.label}
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
