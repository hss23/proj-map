/**
 * Deterministic mock-data generator: ~500 businesses across Metro Vancouver.
 * Points are clustered around real commercial neighbourhoods (with real street
 * names) so the map has realistic density, the case clustering exists for.
 */
import { scoreLead } from '../domain/leadScore';
import type { EmployeeBand, Industry, TelusStatus } from '../domain/constants';

export interface GeneratedBusiness {
  id: number;
  name: string;
  industry: Industry;
  sub_category: string;
  address: string;
  neighbourhood: string;
  city: string;
  postal_code: string;
  lat: number;
  lng: number;
  phone: string;
  website: string | null;
  employee_count: number;
  employee_band: EmployeeBand;
  revenue_band: string;
  year_established: number;
  telus_status: TelusStatus;
  competitor_provider: string | null;
  contract_end_date: string | null;
  lead_score: number;
  scored_at: string;
  last_contacted_at: string | null;
  notes: string | null;
}

/** mulberry32: tiny, fast, seedable PRNG. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)];
  const gaussian = () => {
    // Box-Muller
    const u = Math.max(next(), 1e-9);
    const v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const weighted = <T>(entries: ReadonlyArray<readonly [T, number]>): T => {
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [v, w] of entries) {
      r -= w;
      if (r <= 0) return v;
    }
    return entries[entries.length - 1][0];
  };
  return { next, int, pick, gaussian, weighted };
}
type Rng = ReturnType<typeof createRng>;

interface Hood {
  name: string;
  city: string;
  lat: number;
  lng: number;
  spread: number; // std-dev in degrees
  weight: number;
  streets: string[];
  postal: string[];
  /** Conservative inland polygon [lat, lng][]: keeps mock businesses out of False Creek and Burrard Inlet. */
  land: Array<[number, number]>;
}

const box = (south: number, west: number, north: number, east: number): Array<[number, number]> => [
  [south, west],
  [north, west],
  [north, east],
  [south, east],
];

/** Ray-casting point-in-polygon. */
export function insidePolygon(lat: number, lng: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Gaussian around the centroid, rejection-sampled to stay on land. */
function samplePoint(rng: Rng, hood: Hood): { lat: number; lng: number } {
  const lngScale = Math.cos((hood.lat * Math.PI) / 180); // keep clusters round at 49°N
  for (let attempt = 0; attempt < 200; attempt++) {
    const lat = hood.lat + rng.gaussian() * hood.spread;
    const lng = hood.lng + (rng.gaussian() * hood.spread) / lngScale;
    if (insidePolygon(lat, lng, hood.land)) return { lat: +lat.toFixed(6), lng: +lng.toFixed(6) };
  }
  return { lat: hood.lat, lng: hood.lng };
}

export const HOODS: Hood[] = [
  { name: 'Downtown', land: [[49.2870, -123.1250], [49.2885, -123.1150], [49.2850, -123.1080], [49.2790, -123.1090], [49.2760, -123.1180], [49.2790, -123.1300], [49.2840, -123.1320]], city: 'Vancouver', lat: 49.2835, lng: -123.1185, spread: 0.0045, weight: 70, streets: ['Granville St', 'Robson St', 'W Hastings St', 'Burrard St', 'W Georgia St', 'W Pender St', 'Howe St', 'Seymour St'], postal: ['V6B', 'V6C', 'V6E', 'V6Z'] },
  { name: 'Gastown & Chinatown', land: [[49.2845, -123.1100], [49.2838, -123.0990], [49.2785, -123.0990], [49.2785, -123.1060], [49.2815, -123.1100]], city: 'Vancouver', lat: 49.2822, lng: -123.1045, spread: 0.003, weight: 32, streets: ['Water St', 'Cordova St', 'Carrall St', 'E Pender St', 'Main St', 'Powell St'], postal: ['V6A', 'V6B'] },
  { name: 'Yaletown', land: [[49.2785, -123.1235], [49.2790, -123.1165], [49.2745, -123.1150], [49.2738, -123.1215], [49.2758, -123.1265]], city: 'Vancouver', lat: 49.2754, lng: -123.1215, spread: 0.0028, weight: 28, streets: ['Hamilton St', 'Mainland St', 'Homer St', 'Davie St', 'Pacific Blvd'], postal: ['V6B', 'V6Z'] },
  { name: 'West End', land: [[49.2900, -123.1390], [49.2870, -123.1290], [49.2832, -123.1297], [49.2842, -123.1375], [49.2872, -123.1415]], city: 'Vancouver', lat: 49.2865, lng: -123.1335, spread: 0.0035, weight: 24, streets: ['Denman St', 'Davie St', 'Robson St', 'Thurlow St', 'Bute St'], postal: ['V6E', 'V6G'] },
  { name: 'Mount Pleasant', land: box(49.2560, -123.1080, 49.2685, -123.0900), city: 'Vancouver', lat: 49.2625, lng: -123.1005, spread: 0.0045, weight: 34, streets: ['Main St', 'E Broadway', 'Kingsway', 'E 2nd Ave', 'Quebec St', 'Fraser St'], postal: ['V5T', 'V5V'] },
  { name: 'Fairview & Broadway', land: box(49.2580, -123.1400, 49.2665, -123.1120), city: 'Vancouver', lat: 49.2635, lng: -123.1290, spread: 0.0045, weight: 30, streets: ['W Broadway', 'Granville St', 'Oak St', 'Cambie St', 'W 10th Ave', 'Laurel St'], postal: ['V5Z', 'V6H'] },
  { name: 'Kitsilano', land: box(49.2600, -123.1800, 49.2700, -123.1480), city: 'Vancouver', lat: 49.2680, lng: -123.1640, spread: 0.005, weight: 28, streets: ['W 4th Ave', 'W Broadway', 'Yew St', 'Arbutus St', 'Macdonald St', 'Cornwall Ave'], postal: ['V6K', 'V6J'] },
  { name: 'Commercial Drive', land: box(49.2600, -123.0730, 49.2790, -123.0650), city: 'Vancouver', lat: 49.2705, lng: -123.0695, spread: 0.0045, weight: 24, streets: ['Commercial Dr', 'Venables St', 'E 1st Ave', 'Victoria Dr', 'E Hastings St'], postal: ['V5L', 'V5N'] },
  { name: 'Metrotown', land: box(49.2200, -123.0150, 49.2340, -122.9950), city: 'Burnaby', lat: 49.2265, lng: -123.0045, spread: 0.0065, weight: 42, streets: ['Kingsway', 'Willingdon Ave', 'Beresford St', 'Central Blvd', 'Imperial St', 'Nelson Ave'], postal: ['V5H', 'V5J'] },
  { name: 'Brentwood', land: box(49.2610, -123.0100, 49.2700, -122.9930), city: 'Burnaby', lat: 49.2665, lng: -123.0015, spread: 0.005, weight: 20, streets: ['Lougheed Hwy', 'Willingdon Ave', 'Halifax St', 'Gilmore Ave', 'Dawson St'], postal: ['V5C'] },
  { name: 'Richmond Centre', land: box(49.1600, -123.1450, 49.1800, -123.1250), city: 'Richmond', lat: 49.1690, lng: -123.1370, spread: 0.008, weight: 44, streets: ['No. 3 Rd', 'Westminster Hwy', 'Alderbridge Way', 'Lansdowne Rd', 'Cooney Rd', 'Granville Ave'], postal: ['V6X', 'V6Y'] },
  { name: 'Surrey Central', land: box(49.1800, -122.8600, 49.1960, -122.8380), city: 'Surrey', lat: 49.1885, lng: -122.8480, spread: 0.008, weight: 34, streets: ['King George Blvd', '104 Ave', 'City Pkwy', '108 Ave', '100 Ave', '135A St'], postal: ['V3T', 'V3R'] },
  { name: 'Lonsdale', land: box(49.3110, -123.0800, 49.3260, -123.0650), city: 'North Vancouver', lat: 49.3195, lng: -123.0725, spread: 0.005, weight: 28, streets: ['Lonsdale Ave', 'Esplanade', 'W 3rd St', 'E 13th St', 'Marine Dr'], postal: ['V7L', 'V7M'] },
  { name: 'New Westminster', land: box(49.2040, -122.9230, 49.2160, -122.9050), city: 'New Westminster', lat: 49.2040, lng: -122.9110, spread: 0.0055, weight: 24, streets: ['Columbia St', '6th St', '12th St', 'Carnarvon St', 'Royal Ave'], postal: ['V3M', 'V3L'] },
  { name: 'Coquitlam Centre', land: box(49.2730, -122.8050, 49.2830, -122.7880), city: 'Coquitlam', lat: 49.2780, lng: -122.7975, spread: 0.007, weight: 18, streets: ['Lougheed Hwy', 'Pinetree Way', 'Glen Dr', 'Barnet Hwy', 'Johnson St'], postal: ['V3B'] },
];

interface IndustrySpec {
  industry: Industry;
  weight: number;
  /** median employees, used for a log-normal distribution */
  medianEmployees: number;
  subs: Array<{ sub: string; suffixes: string[] }>;
}

const INDUSTRY_SPECS: IndustrySpec[] = [
  { industry: 'Restaurants & Food', weight: 16, medianEmployees: 14, subs: [
    { sub: 'Café', suffixes: ['Coffee Co.', 'Café', 'Espresso Bar', 'Roasters'] },
    { sub: 'Restaurant', suffixes: ['Bistro', 'Kitchen', 'Eatery', 'Grill', 'Noodle House', 'Sushi'] },
    { sub: 'Bakery', suffixes: ['Bakery', 'Bakehouse', 'Patisserie'] },
    { sub: 'Brewery', suffixes: ['Brewing Co.', 'Taproom', 'Craft Ales'] },
  ] },
  { industry: 'Retail', weight: 14, medianEmployees: 8, subs: [
    { sub: 'Clothing boutique', suffixes: ['Boutique', 'Outfitters', 'Apparel'] },
    { sub: 'Hardware store', suffixes: ['Hardware', 'Home & Garden'] },
    { sub: 'Florist', suffixes: ['Florals', 'Flower Shop'] },
    { sub: 'Electronics', suffixes: ['Electronics', 'Tech Shop'] },
    { sub: 'Pet supply', suffixes: ['Pet Supply', 'Pet Co.'] },
    { sub: 'Bookstore', suffixes: ['Books', 'Book Exchange'] },
  ] },
  { industry: 'Professional Services', weight: 13, medianEmployees: 18, subs: [
    { sub: 'Law firm', suffixes: ['Law LLP', 'Legal Group', '& Partners LLP'] },
    { sub: 'Accounting', suffixes: ['CPA', 'Accounting Group', 'Tax & Advisory'] },
    { sub: 'Consulting', suffixes: ['Consulting', 'Advisory Partners'] },
    { sub: 'Marketing agency', suffixes: ['Creative', 'Media Group', 'Marketing'] },
    { sub: 'Architecture', suffixes: ['Architects', 'Design Studio'] },
  ] },
  { industry: 'Healthcare', weight: 10, medianEmployees: 16, subs: [
    { sub: 'Dental clinic', suffixes: ['Dental', 'Dental Centre'] },
    { sub: 'Physiotherapy', suffixes: ['Physiotherapy', 'Physio & Wellness'] },
    { sub: 'Medical clinic', suffixes: ['Medical Clinic', 'Family Practice'] },
    { sub: 'Pharmacy', suffixes: ['Pharmacy', 'Apothecary'] },
    { sub: 'Veterinary', suffixes: ['Animal Hospital', 'Veterinary Clinic'] },
  ] },
  { industry: 'Construction', weight: 7, medianEmployees: 22, subs: [
    { sub: 'General contractor', suffixes: ['Construction', 'Builders', 'Contracting'] },
    { sub: 'Electrical', suffixes: ['Electric', 'Electrical Services'] },
    { sub: 'Plumbing', suffixes: ['Plumbing & Heating', 'Mechanical'] },
    { sub: 'Renovations', suffixes: ['Renovations', 'Reno Co.'] },
  ] },
  { industry: 'Manufacturing', weight: 5, medianEmployees: 45, subs: [
    { sub: 'Food processing', suffixes: ['Foods Inc.', 'Provisions'] },
    { sub: 'Metal fabrication', suffixes: ['Metalworks', 'Fabrication'] },
    { sub: 'Printing', suffixes: ['Print Co.', 'Press'] },
    { sub: 'Woodworking', suffixes: ['Woodworks', 'Millwork'] },
  ] },
  { industry: 'Real Estate', weight: 6, medianEmployees: 12, subs: [
    { sub: 'Brokerage', suffixes: ['Realty', 'Real Estate Group'] },
    { sub: 'Property management', suffixes: ['Property Management', 'Properties'] },
    { sub: 'Developer', suffixes: ['Developments', 'Land Corp.'] },
  ] },
  { industry: 'Education', weight: 5, medianEmployees: 15, subs: [
    { sub: 'Tutoring centre', suffixes: ['Learning Centre', 'Tutoring'] },
    { sub: 'Language school', suffixes: ['Language Institute', 'English Academy'] },
    { sub: 'Daycare', suffixes: ['Early Learning', 'Childcare'] },
    { sub: 'Music school', suffixes: ['School of Music', 'Music Academy'] },
  ] },
  { industry: 'Hospitality', weight: 4, medianEmployees: 35, subs: [
    { sub: 'Boutique hotel', suffixes: ['Hotel', 'Suites'] },
    { sub: 'Event venue', suffixes: ['Event Space', 'Hall'] },
    { sub: 'Inn', suffixes: ['Inn', 'Guest House'] },
  ] },
  { industry: 'Transportation & Logistics', weight: 5, medianEmployees: 30, subs: [
    { sub: 'Courier', suffixes: ['Courier', 'Express Delivery'] },
    { sub: 'Freight', suffixes: ['Freight', 'Logistics'] },
    { sub: 'Moving company', suffixes: ['Movers', 'Moving & Storage'] },
  ] },
  { industry: 'Technology', weight: 7, medianEmployees: 28, subs: [
    { sub: 'Software', suffixes: ['Software', 'Labs', 'Digital'] },
    { sub: 'IT services', suffixes: ['IT Solutions', 'Managed IT'] },
    { sub: 'Game studio', suffixes: ['Games', 'Interactive'] },
    { sub: 'Cybersecurity', suffixes: ['Security', 'Cyber'] },
  ] },
  { industry: 'Personal Services', weight: 8, medianEmployees: 7, subs: [
    { sub: 'Hair salon', suffixes: ['Salon', 'Hair Studio', 'Barbershop'] },
    { sub: 'Spa', suffixes: ['Spa', 'Day Spa'] },
    { sub: 'Fitness studio', suffixes: ['Fitness', 'Yoga', 'Athletic Club'] },
    { sub: 'Auto repair', suffixes: ['Auto Service', 'Motors', 'Collision'] },
    { sub: 'Dry cleaner', suffixes: ['Cleaners', 'Laundry'] },
  ] },
];

const PREFIXES = [
  'Pacific', 'Cedar', 'Harbour', 'Northshore', 'Coastal', 'Maple', 'Evergreen', 'Lions Gate', 'False Creek',
  'Seawall', 'Summit', 'Blue Heron', 'Orca', 'Raincity', 'Westcoast', 'Mountain View', 'Fraser', 'Stanley',
  'Burrard', 'Cypress', 'Alder', 'Spruce', 'Granite', 'Ironwood', 'Sunset', 'Driftwood', 'Tidewater', 'Kingfisher',
  'Golden Ears', 'Cascade', 'Beacon', 'Riverside', 'Saltwater', 'Highline', 'Copper', 'Juniper', 'Wildflower',
  'Northstar', 'Bluewater', 'Mosaic', 'Urban', 'Heritage', 'True North', 'Granville Island', 'Foxglove',
];
const SURNAMES = [
  'Chen', 'Patel', 'Singh', 'Nguyen', 'Wong', 'MacDonald', 'Kim', 'Li', 'Thompson', 'Gill', 'Tremblay', 'Dhillon',
  'Wilson', 'Park', 'Lam', 'Sandhu', 'Lee', 'Martin', 'Brown', 'Ito', 'Garcia', 'Rossi', 'Khan', 'Tanaka', 'Murphy',
];
const COMPETITORS: ReadonlyArray<readonly [string, number]> = [
  ['Rogers', 40], ['Bell', 30], ['Freedom Mobile', 15], ['Shaw Business', 15],
];
const NOTES = [
  'Owner prefers calls before 10am.',
  'Asked about fibre availability last year.',
  'Multiple locations: ask about consolidated billing.',
  'Expanding: new office opening soon.',
  'Frustrated with current provider outages.',
  'Gatekeeper: ask for the office manager.',
  'Interested in POS + internet bundle.',
  'Uses personal phones for business; mobility opportunity.',
];

function slug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function postalCode(rng: Rng, fsa: string) {
  const L = 'ABCEGHJKLMNPRSTVWXYZ';
  return `${fsa} ${rng.int(1, 9)}${L[rng.int(0, L.length - 1)]}${rng.int(0, 9)}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function bandFor(employees: number): EmployeeBand {
  if (employees < 10) return '1-9';
  if (employees < 50) return '10-49';
  if (employees < 200) return '50-199';
  return '200+';
}

function revenueFor(rng: Rng, employees: number): string {
  const perHead = 80_000 + rng.next() * 120_000;
  const rev = employees * perHead;
  if (rev < 500_000) return '<$500K';
  if (rev < 2_000_000) return '$500K–$2M';
  if (rev < 10_000_000) return '$2M–$10M';
  return '$10M+';
}

export function generateBusinesses(count = 500, seed = 42, now = new Date()): GeneratedBusiness[] {
  const rng = createRng(seed);
  const totalWeight = HOODS.reduce((s, h) => s + h.weight, 0);
  const industryEntries = INDUSTRY_SPECS.map((s) => [s, s.weight] as const);
  const usedNames = new Set<string>();
  const out: GeneratedBusiness[] = [];
  const DAY = 86_400_000;

  // Allocate counts to neighbourhoods proportionally to weight.
  const allocation = HOODS.map((h) => Math.round((h.weight / totalWeight) * count));
  let diff = count - allocation.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % allocation.length) {
    allocation[i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }

  let id = 1;
  HOODS.forEach((hood, hi) => {
    for (let n = 0; n < allocation[hi]; n++) {
      const spec = rng.weighted(industryEntries);
      const { sub, suffixes } = rng.pick(spec.subs);
      let name = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        const base = rng.next() < 0.3 ? rng.pick(SURNAMES) : rng.pick(PREFIXES);
        name = `${base} ${rng.pick(suffixes)}`;
        if (!usedNames.has(name)) break;
      }
      if (usedNames.has(name)) name = `${name} ${hood.name}`;
      usedNames.add(name);

      const { lat, lng } = samplePoint(rng, hood);

      const employees = Math.max(1, Math.round(spec.medianEmployees * Math.exp(rng.gaussian() * 0.9)));
      const band = bandFor(employees);

      const telus = rng.weighted<TelusStatus>([['none', 55], ['mobility', 18], ['internet', 13], ['mobility+internet', 14]]);
      const competitor = telus === 'mobility+internet' ? null : rng.weighted(COMPETITORS);
      // Most competitor customers have a known contract end, spread from 2 months ago to 18 months out.
      const contractEnd = competitor && rng.next() < 0.85 ? isoDate(new Date(now.getTime() + rng.int(-60, 540) * DAY)) : null;
      const lastContacted = rng.next() < 0.45 ? new Date(now.getTime() - rng.int(1, 400) * DAY).toISOString() : null;

      const scoringInput = {
        industry: spec.industry,
        employee_band: band,
        telus_status: telus,
        competitor_provider: competitor,
        contract_end_date: contractEnd,
        last_contacted_at: lastContacted,
      };
      const { score } = scoreLead(scoringInput, now);

      out.push({
        id: id++,
        name,
        sub_category: sub,
        address: `${rng.int(100, 3999)} ${rng.pick(hood.streets)}`,
        neighbourhood: hood.name,
        city: hood.city,
        postal_code: postalCode(rng, rng.pick(hood.postal)),
        lat,
        lng,
        phone: `(${rng.pick(['604', '778', '236'])}) 555-${String(rng.int(0, 9999)).padStart(4, '0')}`,
        // .example is a reserved TLD, so mock URLs never point at a real site.
        website: rng.next() < 0.8 ? `https://www.${slug(name)}.example` : null,
        employee_count: employees,
        revenue_band: revenueFor(rng, employees),
        year_established: rng.int(1965, 2024),
        ...scoringInput,
        lead_score: score,
        scored_at: now.toISOString(),
        notes: rng.next() < 0.35 ? rng.pick(NOTES) : null,
      });
    }
  });
  return out;
}

export const DEMO_AGENTS = [
  { id: 'agent-alex', name: 'Alex Morgan', token: 'demo-token-alex', territory: 'Vancouver Downtown', home_lat: 49.2827, home_lng: -123.1207 },
  { id: 'agent-priya', name: 'Priya Sandhu', token: 'demo-token-priya', territory: 'Burnaby & New West', home_lat: 49.2265, home_lng: -123.0045 },
  { id: 'agent-sam', name: 'Sam Chen', token: 'demo-token-sam', territory: 'Richmond & Surrey', home_lat: 49.169, home_lng: -123.137 },
] as const;
