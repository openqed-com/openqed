import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { OPENQED_DB_PATH } from '../utils/paths.js';
import { MIGRATIONS } from './schema.js';
import { debug } from '../utils/logger.js';

let _db: BetterSqlite3.Database | null = null;

function runMigrations(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db.prepare('SELECT MAX(version) as v FROM _migrations').get() as
    | { v: number | null }
    | undefined;
  const currentVersion = row?.v ?? 0;

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) return;

  const applyAll = db.transaction(() => {
    for (const migration of pending) {
      debug(`Applying migration ${migration.version}: ${migration.description}`);
      db.exec(migration.up);
      db.prepare('INSERT INTO _migrations (version) VALUES (?)').run(
        migration.version,
      );
    }
  });

  applyAll();
}

export async function initStore(
  dbPath: string = OPENQED_DB_PATH,
): Promise<BetterSqlite3.Database> {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  _db = db;
  return db;
}

export function getStore(): BetterSqlite3.Database {
  if (!_db) {
    throw new Error('Store not initialized. Call initStore() first.');
  }
  return _db;
}

export function closeStore(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
