import type BetterSqlite3 from 'better-sqlite3';
import type { ParsedSession } from '../adapters/types.js';
import type { ContextNugget } from '../context/types.js';
import {
  hasNuggetsForSession,
  deleteNuggetsForSession,
  insertNuggets,
  getNuggetsForSession,
} from '../store/nuggets.js';
import { removeSessionIndex, indexSessionContent } from '../store/fts.js';
import { extractHeuristicNuggets } from './heuristic.js';
import { extractLLMNuggets } from './llm.js';
import { condenseForExtraction } from './condense.js';
import { debug } from '../utils/logger.js';

export interface ExtractionOptions {
  force?: boolean;
  llm?: boolean;
  model?: string;
}

export async function ensureNuggetsExtracted(
  db: BetterSqlite3.Database,
  session: ParsedSession,
  opts: ExtractionOptions = {},
): Promise<ContextNugget[]> {
  const sessionId = session.session.id;
  const workspaceId = session.session.workspace.id;

  // Skip if already extracted (unless force)
  if (!opts.force && hasNuggetsForSession(db, sessionId)) {
    return getNuggetsForSession(db, sessionId);
  }

  // Force: clean up existing
  if (opts.force) {
    deleteNuggetsForSession(db, sessionId);
    removeSessionIndex(db, sessionId);
  }

  // Heuristic extraction (always available)
  let drafts = extractHeuristicNuggets(session);

  // LLM extraction (replaces heuristic if available)
  if (opts.llm) {
    const llmDrafts = await extractLLMNuggets(session, { model: opts.model });
    if (llmDrafts.length > 0) {
      drafts = llmDrafts;
    }
  }

  // Insert nuggets (also populates nuggets_fts via insertNugget)
  if (drafts.length > 0) {
    insertNuggets(db, drafts);
  }

  // Index session content for FTS
  const condensed = condenseForExtraction(session);
  indexSessionContent(db, sessionId, workspaceId, condensed);

  return getNuggetsForSession(db, sessionId);
}

export interface BatchResult {
  extracted: number;
  skipped: number;
  failed: number;
}

export async function extractBatch(
  db: BetterSqlite3.Database,
  sessions: ParsedSession[],
  opts: ExtractionOptions & { dryRun?: boolean } = {},
): Promise<BatchResult> {
  const result: BatchResult = { extracted: 0, skipped: 0, failed: 0 };

  for (const session of sessions) {
    const sessionId = session.session.id;

    // Skip if already extracted (unless force)
    if (!opts.force && hasNuggetsForSession(db, sessionId)) {
      result.skipped++;
      continue;
    }

    if (opts.dryRun) {
      result.extracted++;
      continue;
    }

    try {
      await ensureNuggetsExtracted(db, session, opts);
      result.extracted++;
    } catch (err) {
      debug(`Extraction failed for session ${sessionId}: ${(err as Error).message}`);
      result.failed++;
    }
  }

  return result;
}
