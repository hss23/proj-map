import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export type DB = Database.Database;

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

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
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

export function defaultDbPath(): string {
  return process.env.DB_PATH ?? path.join(process.cwd(), 'data', 'prospects.db');
}
