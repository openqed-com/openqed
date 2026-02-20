import type BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { OPENQED_DATA_SUBDIR } from '../utils/paths.js';
import { redact } from '../utils/redact.js';
import { getAllNuggetsForExport } from '../store/nuggets.js';
import {
  getAllSessionsForExport,
  getAllArtifactsForExport,
  getAllDecisionsForExport,
  getAllEventsForExport,
} from '../store/queries.js';
import type { ExportConfig } from './config.js';
import type {
  NuggetRecord,
  SessionRecord,
  DecisionRecord,
  ArtifactRecord,
  EventRecord,
  ExportSummary,
} from './types.js';

const RECORD_VERSION = 1;

function toNuggetRecord(row: Record<string, unknown>): NuggetRecord {
  return {
    _v: RECORD_VERSION,
    session_id: row.session_id as string,
    type: row.type as string,
    summary: redact(row.summary as string),
    detail: row.detail != null ? redact(row.detail as string) : null,
    scope_path: (row.scope_path as string) ?? null,
    scope_symbol: (row.scope_symbol as string) ?? null,
    confidence: row.confidence as number,
    token_cost: (row.token_cost as number) ?? null,
    extracted_at: row.extracted_at as string,
    stale_after: (row.stale_after as string) ?? null,
    metadata: (row.metadata as string) ?? null,
  };
}

function toSessionRecord(row: Record<string, unknown>): SessionRecord {
  return {
    _v: RECORD_VERSION,
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    agent: row.agent as string,
    started_at: row.started_at as string,
    ended_at: (row.ended_at as string) ?? null,
    total_tokens: (row.total_tokens as number) ?? null,
    cost_usd: (row.cost_usd as number) ?? null,
    summary: (row.summary as string) ?? null,
    raw_path: (row.raw_path as string) ?? null,
    metadata: (row.metadata as string) ?? null,
  };
}

function toDecisionRecord(row: Record<string, unknown>): DecisionRecord {
  return {
    _v: RECORD_VERSION,
    session_id: row.session_id as string,
    description: redact(row.description as string),
    reasoning: row.reasoning != null ? redact(row.reasoning as string) : null,
    alternatives: (row.alternatives as string) ?? null,
  };
}

function toArtifactRecord(row: Record<string, unknown>): ArtifactRecord {
  return {
    _v: RECORD_VERSION,
    session_id: row.session_id as string,
    type: row.type as string,
    path: (row.path as string) ?? null,
    uri: (row.uri as string) ?? null,
    change_type: row.change_type as string,
    author: row.author as string,
    size_bytes: (row.size_bytes as number) ?? null,
    content_hash: (row.content_hash as string) ?? null,
    metadata: (row.metadata as string) ?? null,
  };
}

function toEventRecord(row: Record<string, unknown>): EventRecord {
  return {
    _v: RECORD_VERSION,
    session_id: row.session_id as string,
    type: row.type as string,
    timestamp: row.timestamp as string,
    content: row.content != null ? redact(row.content as string) : null,
    tool_name: (row.tool_name as string) ?? null,
    tool_input: row.tool_input != null ? redact(row.tool_input as string) : null,
    tool_output: row.tool_output != null ? redact(row.tool_output as string) : null,
  };
}

function writeJsonlAtomic(filePath: string, records: unknown[]): void {
  if (records.length === 0) {
    // Write empty file
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, '', 'utf-8');
    fs.renameSync(tmpPath, filePath);
    return;
  }
  const content = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, content, 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

export function exportWorkspace(
  db: BetterSqlite3.Database,
  workspaceId: string,
  workspacePath: string,
  config: ExportConfig,
): ExportSummary {
  const dataDir = path.join(workspacePath, OPENQED_DATA_SUBDIR);
  fs.mkdirSync(dataDir, { recursive: true });

  const summary: ExportSummary = {
    sessions: 0,
    nuggets: 0,
    decisions: 0,
    artifacts: 0,
    events: 0,
  };

  if (config.sessions) {
    const rows = getAllSessionsForExport(db, workspaceId);
    const records = rows.map(toSessionRecord);
    writeJsonlAtomic(path.join(dataDir, 'sessions.jsonl'), records);
    summary.sessions = records.length;
  }

  if (config.nuggets) {
    const rows = getAllNuggetsForExport(db, workspaceId);
    const records = rows.map(toNuggetRecord);
    writeJsonlAtomic(path.join(dataDir, 'nuggets.jsonl'), records);
    summary.nuggets = records.length;
  }

  if (config.decisions) {
    const rows = getAllDecisionsForExport(db, workspaceId);
    const records = rows.map(toDecisionRecord);
    writeJsonlAtomic(path.join(dataDir, 'decisions.jsonl'), records);
    summary.decisions = records.length;
  }

  if (config.artifacts) {
    const rows = getAllArtifactsForExport(db, workspaceId);
    const records = rows.map(toArtifactRecord);
    writeJsonlAtomic(path.join(dataDir, 'artifacts.jsonl'), records);
    summary.artifacts = records.length;
  }

  if (config.events) {
    const rows = getAllEventsForExport(db, workspaceId);
    const records = rows.map(toEventRecord);
    writeJsonlAtomic(path.join(dataDir, 'events.jsonl'), records);
    summary.events = records.length;
  }

  return summary;
}
