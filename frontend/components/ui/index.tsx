'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover dark:text-[#17141f] shadow-sm',
  secondary: 'bg-brand-soft text-brand hover:brightness-95 dark:hover:brightness-125',
  outline: 'border border-border bg-surface text-fg hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10',
};
const sizes: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }>(
  function Button({ className, variant = 'outline', size = 'md', type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-[background,color,box-shadow,filter] duration-150 disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      />
    );
  },
);

// ---------------------------------------------------------------- Tooltip
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ label, children, side = 'bottom', kbd }: { label: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; kbd?: string }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[1200] flex items-center gap-2 rounded-md bg-fg px-2 py-1 text-xs font-medium text-bg shadow-lg data-[state=delayed-open]:animate-in"
        >
          {label}
          {kbd && <Kbd className="border-transparent bg-white/20 text-current">{kbd}</Kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------------------------------------------------------- Popover
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ className, align = 'start', ...props }: PopoverPrimitive.PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        collisionPadding={12}
        className={cn('z-[1100] w-72 rounded-xl border border-border bg-surface p-3 text-fg shadow-xl outline-none', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

// ---------------------------------------------------------------- Kbd
export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[11px] font-medium text-muted', className)}>
      {children}
    </kbd>
  );
}

// ---------------------------------------------------------------- Segmented control
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  label,
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; className?: string; title?: string }>;
  size?: 'sm' | 'md';
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-lg bg-surface-2 p-0.5', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={(e) => {
              e.stopPropagation();
              onChange(o.value);
            }}
            className={cn(
              'rounded-md font-medium transition-all',
              size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs',
              active ? cn('bg-surface text-fg shadow-sm', o.className) : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Skeleton
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} />;
}

// ---------------------------------------------------------------- Checkbox row
export function CheckRow({ checked, onChange, children, count }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode; count?: number }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 rounded border-border accent-[var(--brand)]"
      />
      <span className="flex-1">{children}</span>
      {count !== undefined && <span className="text-xs tabular-nums text-muted">{count}</span>}
    </label>
  );
}
