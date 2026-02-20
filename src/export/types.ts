/**
 * JSONL record types for export/import.
 * Field names use snake_case matching SQLite columns.
 * Autoincrement `id` fields are excluded — they're local to each machine's DB.
 */

export interface BaseRecord {
  _v: number;
}

export interface NuggetRecord extends BaseRecord {
  session_id: string;
  type: string;
  summary: string;
  detail: string | null;
  scope_path: string | null;
  scope_symbol: string | null;
  confidence: number;
  token_cost: number | null;
  extracted_at: string;
  stale_after: string | null;
  metadata: string | null;
}

export interface SessionRecord extends BaseRecord {
  id: string;
  workspace_id: string;
  agent: string;
  started_at: string;
  ended_at: string | null;
  total_tokens: number | null;
  cost_usd: number | null;
  summary: string | null;
  raw_path: string | null;
  metadata: string | null;
}

export interface DecisionRecord extends BaseRecord {
  session_id: string;
  description: string;
  reasoning: string | null;
  alternatives: string | null;
}

export interface ArtifactRecord extends BaseRecord {
  session_id: string;
  type: string;
  path: string | null;
  uri: string | null;
  change_type: string;
  author: string;
  size_bytes: number | null;
  content_hash: string | null;
  metadata: string | null;
}

export interface EventRecord extends BaseRecord {
  session_id: string;
  type: string;
  timestamp: string;
  content: string | null;
  tool_name: string | null;
  tool_input: string | null;
  tool_output: string | null;
}

export type ExportableRecord =
  | NuggetRecord
  | SessionRecord
  | DecisionRecord
  | ArtifactRecord
  | EventRecord;

export interface ExportSummary {
  sessions: number;
  nuggets: number;
  decisions: number;
  artifacts: number;
  events: number;
}

export interface ImportSummary {
  sessions: { inserted: number; skipped: number; errored: number };
  nuggets: { inserted: number; skipped: number; errored: number };
  decisions: { inserted: number; skipped: number; errored: number };
  artifacts: { inserted: number; skipped: number; errored: number };
}
