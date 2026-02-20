import type BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { OPENQED_DATA_SUBDIR } from '../utils/paths.js';
import { insertNugget } from '../store/nuggets.js';
import type { ExportConfig } from './config.js';
import type {
  NuggetRecord,
  SessionRecord,
  DecisionRecord,
  ArtifactRecord,
  ImportSummary,
} from './types.js';

function readJsonlFile<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (content === '') return [];
  return content.split('\n').map((line) => JSON.parse(line) as T);
}

function importSessions(
  db: BetterSqlite3.Database,
  records: SessionRecord[],
): { inserted: number; skipped: number; errored: number } {
  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  const importAll = db.transaction(() => {
    for (const rec of records) {
      if (rec._v !== 1) {
        errored++;
        continue;
      }
      try {
        // Sessions have TEXT UUID as id — use INSERT OR IGNORE for dedup
        const result = db.prepare(
          `INSERT OR IGNORE INTO sessions (id, workspace_id, agent, started_at, ended_at, total_tokens, cost_usd, summary, raw_path, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          rec.id,
          rec.workspace_id,
          rec.agent,
          rec.started_at,
          rec.ended_at,
          rec.total_tokens,
          rec.cost_usd,
          rec.summary,
          rec.raw_path,
          rec.metadata,
        );
        if (result.changes > 0) inserted++;
        else skipped++;
      } catch {
        errored++;
      }
    }
  });
  importAll();
  return { inserted, skipped, errored };
}

function importNuggets(
  db: BetterSqlite3.Database,
  records: NuggetRecord[],
): { inserted: number; skipped: number; errored: number } {
  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  const importAll = db.transaction(() => {
    for (const rec of records) {
      if (rec._v !== 1) {
        errored++;
        continue;
      }
      try {
        // Dedup by natural key: (session_id, type, scope_path, summary)
        const existing = db.prepare(
          `SELECT id FROM context_nuggets
           WHERE session_id = ? AND type = ? AND COALESCE(scope_path, '') = ? AND summary = ?`,
        ).get(
          rec.session_id,
          rec.type,
          rec.scope_path ?? '',
          rec.summary,
        );
        if (existing) {
          skipped++;
          continue;
        }
        insertNugget(db, {
          sessionId: rec.session_id,
          type: rec.type as any,
          summary: rec.summary,
          detail: rec.detail ?? undefined,
          scopePath: rec.scope_path ?? undefined,
          scopeSymbol: rec.scope_symbol ?? undefined,
          confidence: rec.confidence,
          tokenCost: rec.token_cost ?? undefined,
          extractedAt: rec.extracted_at,
          staleAfter: rec.stale_after ?? undefined,
          metadata: rec.metadata ? JSON.parse(rec.metadata) : undefined,
        });
        inserted++;
      } catch {
        errored++;
      }
    }
  });
  importAll();
  return { inserted, skipped, errored };
}

function importDecisions(
  db: BetterSqlite3.Database,
  records: DecisionRecord[],
): { inserted: number; skipped: number; errored: number } {
  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  const importAll = db.transaction(() => {
    for (const rec of records) {
      if (rec._v !== 1) {
        errored++;
        continue;
      }
      try {
        // Dedup by natural key: (session_id, description)
        const existing = db.prepare(
          `SELECT id FROM decisions WHERE session_id = ? AND description = ?`,
        ).get(rec.session_id, rec.description);
        if (existing) {
          skipped++;
          continue;
        }
        db.prepare(
          `INSERT INTO decisions (session_id, description, reasoning, alternatives)
           VALUES (?, ?, ?, ?)`,
        ).run(rec.session_id, rec.description, rec.reasoning, rec.alternatives);
        inserted++;
      } catch {
        errored++;
      }
    }
  });
  importAll();
  return { inserted, skipped, errored };
}

function importArtifacts(
  db: BetterSqlite3.Database,
  records: ArtifactRecord[],
): { inserted: number; skipped: number; errored: number } {
  let inserted = 0;
  let skipped = 0;
  let errored = 0;

  const importAll = db.transaction(() => {
    for (const rec of records) {
      if (rec._v !== 1) {
        errored++;
        continue;
      }
      try {
        // Dedup by natural key: (session_id, path, change_type)
        const existing = db.prepare(
          `SELECT id FROM artifacts WHERE session_id = ? AND COALESCE(path, '') = ? AND change_type = ?`,
        ).get(rec.session_id, rec.path ?? '', rec.change_type);
        if (existing) {
          skipped++;
          continue;
        }
        db.prepare(
          `INSERT INTO artifacts (session_id, event_id, type, path, uri, change_type, author, size_bytes, content_hash, metadata)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          rec.session_id,
          null,
          rec.type,
          rec.path,
          rec.uri,
          rec.change_type,
          rec.author,
          rec.size_bytes,
          rec.content_hash,
          rec.metadata,
        );
        inserted++;
      } catch {
        errored++;
      }
    }
  });
  importAll();
  return { inserted, skipped, errored };
}

export function importWorkspace(
  db: BetterSqlite3.Database,
  workspacePath: string,
  config: ExportConfig,
): ImportSummary {
  const dataDir = path.join(workspacePath, OPENQED_DATA_SUBDIR);

  const summary: ImportSummary = {
    sessions: { inserted: 0, skipped: 0, errored: 0 },
    nuggets: { inserted: 0, skipped: 0, errored: 0 },
    decisions: { inserted: 0, skipped: 0, errored: 0 },
    artifacts: { inserted: 0, skipped: 0, errored: 0 },
  };

  // Sessions must be imported first (foreign key dependencies)
  if (config.sessions) {
    const records = readJsonlFile<SessionRecord>(path.join(dataDir, 'sessions.jsonl'));
    summary.sessions = importSessions(db, records);
  }

  if (config.nuggets) {
    const records = readJsonlFile<NuggetRecord>(path.join(dataDir, 'nuggets.jsonl'));
    summary.nuggets = importNuggets(db, records);
  }

  if (config.decisions) {
    const records = readJsonlFile<DecisionRecord>(path.join(dataDir, 'decisions.jsonl'));
    summary.decisions = importDecisions(db, records);
  }

  if (config.artifacts) {
    const records = readJsonlFile<ArtifactRecord>(path.join(dataDir, 'artifacts.jsonl'));
    summary.artifacts = importArtifacts(db, records);
  }

  return summary;
}
