require('dotenv').config();
const { getDb, closeDb } = require('../config/database');
const migration001 = require('./001_initial');
const migration002 = require('./002_tracking_url');

const migrations = [migration001, migration002];

function runMigrations() {
  const db = getDb();

  // Ensure migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const applied = db.prepare('SELECT name FROM migrations').all().map((r) => r.name);

  for (const migration of migrations) {
    if (!applied.includes(migration.name)) {
      console.log(`Applying migration: ${migration.name}`);
      migration.up(db);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration.name);
      console.log(`  ✓ ${migration.name} applied`);
    } else {
      console.log(`  ⏭ ${migration.name} already applied`);
    }
  }

  console.log('All migrations complete.');
  closeDb();
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
