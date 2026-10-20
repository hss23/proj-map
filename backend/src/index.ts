import { createApp } from './app';
import { defaultDbPath, openDb } from './db/connection';
import { isEmpty, seedDatabase } from './db/seed';

const PORT = Number(process.env.PORT ?? 4000);
const dbPath = defaultDbPath();
const db = openDb(dbPath);

if (isEmpty(db)) {
  const { businesses } = seedDatabase(db, { demoClaims: true });
  console.log(`Empty database: seeded ${businesses} mock businesses`);
}

const server = createApp(db, { logRequests: process.env.NODE_ENV !== 'test' }).listen(PORT, () => {
  console.log(`Prospect Map API listening on http://localhost:${PORT} (db: ${dbPath})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
