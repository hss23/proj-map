import { defaultDbPath, openDb, type DB } from './connection';
import { DEMO_AGENTS, generateBusinesses, type GeneratedBusiness } from './generate';

export interface SeedOptions {
  businesses?: GeneratedBusiness[];
  /** Pre-claim a few leads for the other agents so the "claimed" state is visible on first run. */
  demoClaims?: boolean;
}

/** Replaces all data with a fresh, deterministic dataset. */
export function seedDatabase(db: DB, opts: SeedOptions = {}) {
  const businesses = opts.businesses ?? generateBusinesses();

  const insertAgent = db.prepare(
    `INSERT INTO agents (id, name, token, territory, home_lat, home_lng)
     VALUES (@id, @name, @token, @territory, @home_lat, @home_lng)`,
  );
  const insertBusiness = db.prepare(
    `INSERT INTO businesses (id, name, industry, sub_category, address, city, postal_code, lat, lng, phone, website,
       employee_count, employee_band, revenue_band, year_established, telus_status, competitor_provider,
       contract_end_date, lead_score, last_contacted_at, notes)
     VALUES (@id, @name, @industry, @sub_category, @address, @city, @postal_code, @lat, @lng, @phone, @website,
       @employee_count, @employee_band, @revenue_band, @year_established, @telus_status, @competitor_provider,
       @contract_end_date, @lead_score, @last_contacted_at, @notes)`,
  );
  const insertRtree = db.prepare(
    'INSERT INTO business_rtree (id, min_lng, max_lng, min_lat, max_lat) VALUES (?, ?, ?, ?, ?)',
  );
  const insertClaim = db.prepare(
    'INSERT INTO queue_items (agent_id, business_id, position, priority) VALUES (?, ?, ?, ?)',
  );

  db.transaction(() => {
    db.exec(`DELETE FROM queue_items; DELETE FROM business_rtree; DELETE FROM businesses; DELETE FROM agents;`);
    for (const a of DEMO_AGENTS) insertAgent.run(a);
    for (const b of businesses) {
      insertBusiness.run(b);
      insertRtree.run(b.id, b.lng, b.lng, b.lat, b.lat);
    }
    db.exec(`INSERT INTO business_fts(business_fts) VALUES('rebuild')`);

    if (opts.demoClaims) {
      // Priya and Sam each claimed some high-score leads in their own territory.
      const claim = (agentId: string, city: string, n: number) => {
        const ids = db
          .prepare('SELECT id FROM businesses WHERE city = ? ORDER BY lead_score DESC, id LIMIT ?')
          .all(city, n) as Array<{ id: number }>;
        ids.forEach(({ id }, i) => insertClaim.run(agentId, id, i, i < 2 ? 'high' : 'medium'));
      };
      claim('agent-priya', 'Burnaby', 5);
      claim('agent-sam', 'Richmond', 5);
      // ...and one each downtown, so the conflict is visible in Alex's default view.
      const downtown = db
        .prepare(`SELECT id FROM businesses WHERE city = 'Vancouver' ORDER BY lead_score DESC, id LIMIT 3`)
        .all() as Array<{ id: number }>;
      insertClaim.run('agent-priya', downtown[1].id, 5, 'high');
      insertClaim.run('agent-sam', downtown[2].id, 5, 'high');
    }
  })();

  return { businesses: businesses.length, agents: DEMO_AGENTS.length };
}

export function isEmpty(db: DB): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM businesses').get() as { n: number };
  return row.n === 0;
}

// CLI: `npm run seed` resets the database file.
if (require.main === module) {
  const file = defaultDbPath();
  const db = openDb(file);
  const result = seedDatabase(db, { demoClaims: true });
  console.log(`Seeded ${result.businesses} businesses and ${result.agents} agents into ${file}`);
  db.close();
}
