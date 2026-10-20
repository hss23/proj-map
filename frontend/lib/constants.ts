import {
  BedDouble,
  Briefcase,
  Building2,
  Cpu,
  Factory,
  GraduationCap,
  HardHat,
  type LucideIcon,
  Scissors,
  ShoppingBag,
  Stethoscope,
  Store,
  Truck,
  UtensilsCrossed,
} from 'lucide-react';
import type { EmployeeBand, Filters, Priority, SortKey, TelusStatus } from './types';

/** Mock auth: in production the token comes from SSO. */
export const DEMO_AGENTS = [
  { id: 'agent-alex', name: 'Alex Morgan', token: 'demo-token-alex', territory: 'Vancouver Downtown', home: { lat: 49.2827, lng: -123.1207 }, color: '#7c3aed' },
  { id: 'agent-priya', name: 'Priya Sandhu', token: 'demo-token-priya', territory: 'Burnaby & New West', home: { lat: 49.2265, lng: -123.0045 }, color: '#0d9488' },
  { id: 'agent-sam', name: 'Sam Chen', token: 'demo-token-sam', territory: 'Richmond & Surrey', home: { lat: 49.169, lng: -123.137 }, color: '#d97706' },
] as const;
export type DemoAgent = (typeof DEMO_AGENTS)[number];

export const DEFAULT_FILTERS: Filters = {
  q: '',
  industry: [],
  employeeBand: [],
  telusStatus: [],
  minScore: null,
  renewalWithinDays: null,
  claim: 'all',
};

export const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  'Restaurants & Food': UtensilsCrossed,
  Retail: ShoppingBag,
  'Professional Services': Briefcase,
  Healthcare: Stethoscope,
  Construction: HardHat,
  Manufacturing: Factory,
  'Real Estate': Building2,
  Education: GraduationCap,
  Hospitality: BedDouble,
  'Transportation & Logistics': Truck,
  Technology: Cpu,
  'Personal Services': Scissors,
};
export const industryIcon = (industry: string): LucideIcon => INDUSTRY_ICONS[industry] ?? Store;

export const TELUS_STATUS_LABEL: Record<TelusStatus, string> = {
  none: 'Not a TELUS customer',
  mobility: 'TELUS Mobility only',
  internet: 'TELUS Internet only',
  'mobility+internet': 'TELUS Mobility + Internet',
};

export const BAND_LABEL: Record<EmployeeBand, string> = {
  '1-9': '1–9',
  '10-49': '10–49',
  '50-199': '50–199',
  '200+': '200+',
};

export const SORT_LABEL: Record<SortKey, string> = {
  score: 'Lead score',
  distance: 'Distance',
  renewal: 'Renewal soonest',
  name: 'Name (A–Z)',
};

export const PRIORITY_META: Record<Priority, { label: string; short: string; className: string; dot: string }> = {
  high: { label: 'High', short: 'H', className: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300', dot: 'bg-rose-500' },
  medium: { label: 'Medium', short: 'M', className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  low: { label: 'Low', short: 'L', className: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300', dot: 'bg-slate-400' },
};

export type Tier = 'hot' | 'warm' | 'cool';
export const tierOf = (score: number): Tier => (score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cool');
export const TIER_META: Record<Tier, { label: string; color: string; pill: string }> = {
  hot: { label: 'Hot', color: '#e8590c', pill: 'bg-orange-100 text-orange-800 ring-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/40' },
  warm: { label: 'Warm', color: '#e0a100', pill: 'bg-amber-50 text-amber-800 ring-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/40' },
  cool: { label: 'Cool', color: '#5c7cfa', pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/40' },
};
export const CLAIMED_COLOR = '#9ca3af';
export const MINE_COLOR = '#4b286d';

export const RENEWAL_OPTIONS = [30, 60, 90, 180, 365] as const;

export const VANCOUVER = { lat: 49.2827, lng: -123.1207 };
export const DEFAULT_ZOOM = 13;
export const MIN_ZOOM = 10;
