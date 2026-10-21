import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

/**
 * Bump when schema.sql changes incompatibly. All data here is generated (seeded), so an
 * outdated database is simply rebuilt and re-seeded on startup rather than migrated.
 * v2: businesses.neighbourhood (+ FTS column).
 */
export const SCHEMA_VERSION = 2;
const TABLES_TO_DROP = ['queue_items', 'business_fts', 'business_rtree', 'businesses', 'agents'];

/**
 * Opens (or creates) a SQLite database and applies the schema.
 * Pass ':memory:' for tests.
 */
export function openDb(filename: string): DB {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version < SCHEMA_VERSION) {
    db.pragma('foreign_keys = OFF');
    for (const t of TABLES_TO_DROP) db.exec(`DROP TABLE IF EXISTS ${t}`);
    db.pragma('foreign_keys = ON');
  }
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  db.pragma(`user_version = ${SCHEMA_VERSION}`);
  return db;
}

export function defaultDbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'prospects.db');
}
