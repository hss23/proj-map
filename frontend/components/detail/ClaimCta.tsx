'use client';

import { Check, Lock, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Segmented } from '@/components/ui';
import { PRIORITY_META } from '@/lib/constants';
import type { Claim, Priority } from '@/lib/types';

/** The primary action for a business, driven entirely by its claim state. Pure, for easy testing. */
export function ClaimCta({
  claim,
  onAdd,
  onRemove,
  onPriorityChange,
  pending,
}: {
  claim: Claim;
  onAdd: (priority: Priority) => void;
  onRemove: () => void;
  onPriorityChange: (p: Priority) => void;
  pending?: boolean;
}) {
  const [priority, setPriority] = useState<Priority>('medium');
  const priorityOptions = (['high', 'medium', 'low'] as const).map((p) => ({ value: p, label: PRIORITY_META[p].label, className: PRIORITY_META[p].className }));

  if (claim.status === 'other') {
    return (
      <div className="space-y-2">
        <Button size="lg" className="w-full" disabled aria-describedby="claimed-help">
          <Lock /> Claimed by {claim.agentName}
        </Button>
        <p id="claimed-help" className="text-center text-xs text-muted">
          Leads can only be worked by one agent. Ask {claim.agentName.split(' ')[0]} to release it if it&apos;s stale.
        </p>
      </div>
    );
  }

  if (claim.status === 'mine') {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
            <Check className="size-4" /> In your queue
          </span>
          <Segmented<Priority> label="Priority" size="sm" value={claim.priority} onChange={onPriorityChange} options={priorityOptions} />
        </div>
        <Button variant="danger" size="md" className="w-full border border-rose-200 dark:border-rose-500/30" onClick={onRemove} disabled={pending}>
          <Trash2 /> Remove from queue
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        Priority
        <Segmented<Priority> label="Priority for new lead" size="sm" value={priority} onChange={setPriority} options={priorityOptions} />
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={() => onAdd(priority)} disabled={pending}>
        <Plus /> Add to my queue
      </Button>
    </div>
  );
}
