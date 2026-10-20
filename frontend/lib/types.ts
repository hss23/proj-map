// Mirrors the backend API contract (see README "API contract").

export type Priority = 'high' | 'medium' | 'low';
export type TelusStatus = 'none' | 'mobility' | 'internet' | 'mobility+internet';
export type EmployeeBand = '1-9' | '10-49' | '50-199' | '200+';
export type ClaimFilter = 'all' | 'unclaimed' | 'mine';
export type SortKey = 'score' | 'distance' | 'renewal' | 'name';

export type Claim =
  | { status: 'unclaimed' }
  | { status: 'mine'; priority: Priority }
  | { status: 'other'; agentId: string; agentName: string };

export interface BusinessSummary {
  id: number;
  name: string;
  industry: string;
  subCategory: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  employeeCount: number;
  employeeBand: EmployeeBand;
  telusStatus: TelusStatus;
  competitorProvider: string | null;
  contractEndDate: string | null;
  leadScore: number;
  claim: Claim;
  distanceKm?: number;
}

export interface LeadSignal {
  tone: 'positive' | 'neutral' | 'negative';
  label: string;
}

export interface BusinessDetail extends BusinessSummary {
  postalCode: string;
  phone: string | null;
  website: string | null;
  revenueBand: string;
  yearEstablished: number | null;
  lastContactedAt: string | null;
  notes: string | null;
  signals: LeadSignal[];
}

export interface SearchResponse {
  items: BusinessSummary[];
  total: number;
  truncated: boolean;
  facets: { industry: Record<string, number> };
}

export interface QueueItem {
  businessId: number;
  position: number;
  priority: Priority;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  business: BusinessSummary;
}

export interface FilterMeta {
  industries: string[];
  employeeBands: EmployeeBand[];
  telusStatuses: TelusStatus[];
  priorities: Priority[];
  competitors: string[];
}

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface Filters {
  q: string;
  industry: string[];
  employeeBand: EmployeeBand[];
  telusStatus: TelusStatus[];
  minScore: number | null;
  renewalWithinDays: number | null;
  claim: ClaimFilter;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
