import path from 'node:path';
import type BetterSqlite3 from 'better-sqlite3';
import type { ContextNugget, StalenessCheck } from './types.js';
import { hashFileSync } from '../utils/file-hash.js';

export function checkStaleness(
  db: BetterSqlite3.Database,
  nugget: ContextNugget,
  workspacePath: string,
): StalenessCheck {
  // 1. Check file hash: has the file changed since the nugget was created?
  if (nugget.scopePath) {
    const absPath = path.resolve(workspacePath, nugget.scopePath);
    const currentHash = hashFileSync(absPath);

    if (currentHash !== null) {
      // Check if any artifact from the session has a different hash
      const row = db.prepare(
        `SELECT content_hash FROM artifacts
         WHERE session_id = ? AND path = ? AND content_hash IS NOT NULL
         LIMIT 1`,
      ).get(nugget.sessionId, nugget.scopePath) as { content_hash: string } | undefined;

      if (row && row.content_hash && row.content_hash !== currentHash) {
        return {
          nuggetId: nugget.id,
          isStale: true,
          staleReason: 'file_changed',
        };
      }
    }
  }

  // 2. Check supersession: newer nugget with same scope_path + type
  if (nugget.scopePath) {
    const newer = db.prepare(
      `SELECT id FROM context_nuggets
       WHERE scope_path = ? AND type = ? AND id > ? AND session_id != ?
       ORDER BY id DESC
       LIMIT 1`,
    ).get(nugget.scopePath, nugget.type, nugget.id, nugget.sessionId) as
      | { id: number }
      | undefined;

    if (newer) {
      return {
        nuggetId: nugget.id,
        isStale: true,
        staleReason: 'superseded',
        supersededBy: newer.id,
      };
    }
  }

  // 3. Check expiry
  if (nugget.staleAfter) {
    const expiryDate = new Date(nugget.staleAfter);
    if (expiryDate < new Date()) {
      return {
        nuggetId: nugget.id,
        isStale: true,
        staleReason: 'expired',
      };
    }
  }

  return { nuggetId: nugget.id, isStale: false };
}

export function checkBatchStaleness(
  db: BetterSqlite3.Database,
  nuggets: ContextNugget[],
  workspacePath: string,
): Map<number, StalenessCheck> {
  const results = new Map<number, StalenessCheck>();
  for (const nugget of nuggets) {
    results.set(nugget.id, checkStaleness(db, nugget, workspacePath));
  }
  return results;
}
