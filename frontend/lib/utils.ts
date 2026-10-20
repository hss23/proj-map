import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DAY_MS = 86_400_000;

export function daysUntil(iso: string, now = new Date()): number {
  return Math.round((Date.parse(iso) - now.getTime()) / DAY_MS);
}

/** "in 42 days", "3 weeks ago", ... */
export function relativeDays(iso: string, now = new Date()): string {
  const d = daysUntil(iso, now);
  const rtf = new Intl.RelativeTimeFormat('en-CA', { numeric: 'auto' });
  const abs = Math.abs(d);
  if (abs < 14) return rtf.format(d, 'day');
  if (abs < 60) return rtf.format(Math.round(d / 7), 'week');
  if (abs < 365) return rtf.format(Math.round(d / 30), 'month');
  return rtf.format(Math.round(d / 365), 'year');
}

export interface RenewalInfo {
  label: string;
  tone: 'urgent' | 'soon' | 'later' | 'expired';
}

export function renewalInfo(contractEndDate: string | null, provider: string | null, now = new Date()): RenewalInfo | null {
  if (!contractEndDate || !provider) return null;
  const d = daysUntil(contractEndDate, now);
  if (d < 0) return { label: 'Out of contract', tone: 'expired' };
  if (d <= 90) return { label: `Renews in ${d}d`, tone: 'urgent' };
  if (d <= 180) return { label: `Renews in ${Math.round(d / 30)}mo`, tone: 'soon' };
  return { label: `Renews in ${Math.round(d / 30)}mo`, tone: 'later' };
}

export function formatDistance(km?: number): string | null {
  if (km === undefined) return null;
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const debounced = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(t);
  return debounced;
}

/** True when the keyboard event target is a text field (so shortcuts don't hijack typing). */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
