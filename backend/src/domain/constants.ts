export const INDUSTRIES = [
  'Restaurants & Food',
  'Retail',
  'Professional Services',
  'Healthcare',
  'Construction',
  'Manufacturing',
  'Real Estate',
  'Education',
  'Hospitality',
  'Transportation & Logistics',
  'Technology',
  'Personal Services',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const EMPLOYEE_BANDS = ['1-9', '10-49', '50-199', '200+'] as const;
export type EmployeeBand = (typeof EMPLOYEE_BANDS)[number];

export const REVENUE_BANDS = ['<$500K', '$500K–$2M', '$2M–$10M', '$10M+'] as const;

export const TELUS_STATUSES = ['none', 'mobility', 'internet', 'mobility+internet'] as const;
export type TelusStatus = (typeof TELUS_STATUSES)[number];

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CLAIM_FILTERS = ['all', 'unclaimed', 'mine'] as const;
export const SORTS = ['score', 'distance', 'renewal', 'name'] as const;
export type Sort = (typeof SORTS)[number];

/** Hard cap on queue size: a day's work, not a dumping ground. */
export const MAX_QUEUE_SIZE = 100;
/** Max rows returned from a map search; the client is told when it is truncated. */
export const MAX_SEARCH_LIMIT = 500;
export const DEFAULT_SEARCH_LIMIT = 300;
