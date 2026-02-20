import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession } from '../../src/store/store.js';
import { insertNugget, getNuggetsForSession } from '../../src/store/nuggets.js';
import { importWorkspace } from '../../src/export/importer.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession } from '../../src/adapters/types.js';
import type { ExportConfig } from '../../src/export/config.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const workspace: Workspace = {
  id: 'ws_import_test',
  type: 'git_repo',
  path: '/tmp/import-test',
  name: 'import-test',
};

function makeSession(id: string): AgentSession {
  return {
    id,
    workspace,
    agent: 'claude-code',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    endedAt: new Date('2025-01-15T10:30:00Z'),
  };
}

const fullConfig: ExportConfig = {
  nuggets: true,
  sessions: true,
  decisions: true,
  artifacts: true,
  events: false,
};

function writeJsonl(dir: string, filename: string, records: unknown[]): void {
  const dataDir = path.join(dir, '.openqed/data');
  fs.mkdirSync(dataDir, { recursive: true });
  if (records.length === 0) {
    fs.writeFileSync(path.join(dataDir, filename), '', 'utf-8');
  } else {
    fs.writeFileSync(
      path.join(dataDir, filename),
      records.map((r) => JSON.stringify(r)).join('\n') + '\n',
      'utf-8',
    );
  }
}

describe('importer', () => {
  let db: ReturnType<typeof Database>;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oqed-import-'));
    upsertWorkspace(db, workspace);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports new sessions', () => {
    writeJsonl(tmpDir, 'sessions.jsonl', [
      {
        _v: 1,
        id: 'imported-s1',
        workspace_id: workspace.id,
        agent: 'claude-code',
        started_at: '2025-01-15T10:00:00.000Z',
        ended_at: '2025-01-15T10:30:00.000Z',
        total_tokens: null,
        cost_usd: null,
        summary: null,
        raw_path: null,
        metadata: null,
      },
    ]);
    writeJsonl(tmpDir, 'nuggets.jsonl', []);
    writeJsonl(tmpDir, 'decisions.jsonl', []);
    writeJsonl(tmpDir, 'artifacts.jsonl', []);

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.sessions.inserted).toBe(1);
    expect(summary.sessions.skipped).toBe(0);

    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('imported-s1') as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.agent).toBe('claude-code');
  });

  it('skips duplicate sessions', () => {
    upsertSession(db, makeSession('existing-s1'));

    writeJsonl(tmpDir, 'sessions.jsonl', [
      {
        _v: 1,
        id: 'existing-s1',
        workspace_id: workspace.id,
        agent: 'claude-code',
        started_at: '2025-01-15T10:00:00.000Z',
        ended_at: null,
        total_tokens: null,
        cost_usd: null,
        summary: null,
        raw_path: null,
        metadata: null,
      },
    ]);
    writeJsonl(tmpDir, 'nuggets.jsonl', []);
    writeJsonl(tmpDir, 'decisions.jsonl', []);
    writeJsonl(tmpDir, 'artifacts.jsonl', []);

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.sessions.inserted).toBe(0);
    expect(summary.sessions.skipped).toBe(1);
  });

  it('imports new nuggets and skips duplicates', () => {
    upsertSession(db, makeSession('s1'));

    // Pre-insert one nugget
    insertNugget(db, {
      sessionId: 's1',
      type: 'intent',
      summary: 'existing nugget',
      confidence: 0.8,
      extractedAt: '2025-01-15T10:15:00Z',
    });

    writeJsonl(tmpDir, 'sessions.jsonl', []);
    writeJsonl(tmpDir, 'nuggets.jsonl', [
      {
        _v: 1,
        session_id: 's1',
        type: 'intent',
        summary: 'existing nugget',
        detail: null,
        scope_path: null,
        scope_symbol: null,
        confidence: 0.8,
        token_cost: null,
        extracted_at: '2025-01-15T10:15:00Z',
        stale_after: null,
        metadata: null,
      },
      {
        _v: 1,
        session_id: 's1',
        type: 'decision',
        summary: 'new nugget',
        detail: 'details here',
        scope_path: 'src/foo.ts',
        scope_symbol: null,
        confidence: 0.9,
        token_cost: 50,
        extracted_at: '2025-01-15T10:20:00Z',
        stale_after: null,
        metadata: null,
      },
    ]);
    writeJsonl(tmpDir, 'decisions.jsonl', []);
    writeJsonl(tmpDir, 'artifacts.jsonl', []);

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.nuggets.inserted).toBe(1);
    expect(summary.nuggets.skipped).toBe(1);

    const nuggets = getNuggetsForSession(db, 's1');
    expect(nuggets).toHaveLength(2);
  });

  it('handles missing JSONL files gracefully', () => {
    // Don't write any files, just create the data directory
    fs.mkdirSync(path.join(tmpDir, '.openqed/data'), { recursive: true });

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.sessions.inserted).toBe(0);
    expect(summary.nuggets.inserted).toBe(0);
  });

  it('rejects records with invalid _v', () => {
    upsertSession(db, makeSession('s1'));

    writeJsonl(tmpDir, 'sessions.jsonl', []);
    writeJsonl(tmpDir, 'nuggets.jsonl', [
      {
        _v: 99,
        session_id: 's1',
        type: 'intent',
        summary: 'bad version',
        detail: null,
        scope_path: null,
        scope_symbol: null,
        confidence: 0.8,
        token_cost: null,
        extracted_at: '2025-01-15T10:15:00Z',
        stale_after: null,
        metadata: null,
      },
    ]);
    writeJsonl(tmpDir, 'decisions.jsonl', []);
    writeJsonl(tmpDir, 'artifacts.jsonl', []);

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.nuggets.errored).toBe(1);
    expect(summary.nuggets.inserted).toBe(0);
  });

  it('imports decisions', () => {
    upsertSession(db, makeSession('s1'));

    writeJsonl(tmpDir, 'sessions.jsonl', []);
    writeJsonl(tmpDir, 'nuggets.jsonl', []);
    writeJsonl(tmpDir, 'decisions.jsonl', [
      {
        _v: 1,
        session_id: 's1',
        description: 'chose REST over GraphQL',
        reasoning: 'simpler for our use case',
        alternatives: 'GraphQL, gRPC',
      },
    ]);
    writeJsonl(tmpDir, 'artifacts.jsonl', []);

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.decisions.inserted).toBe(1);

    const row = db.prepare('SELECT * FROM decisions WHERE session_id = ?').get('s1') as Record<string, unknown>;
    expect(row.description).toBe('chose REST over GraphQL');
  });

  it('imports artifacts', () => {
    upsertSession(db, makeSession('s1'));

    writeJsonl(tmpDir, 'sessions.jsonl', []);
    writeJsonl(tmpDir, 'nuggets.jsonl', []);
    writeJsonl(tmpDir, 'decisions.jsonl', []);
    writeJsonl(tmpDir, 'artifacts.jsonl', [
      {
        _v: 1,
        session_id: 's1',
        type: 'file',
        path: 'src/index.ts',
        uri: null,
        change_type: 'modify',
        author: 'agent',
        size_bytes: null,
        content_hash: null,
        metadata: null,
      },
    ]);

    const summary = importWorkspace(db, tmpDir, fullConfig);
    expect(summary.artifacts.inserted).toBe(1);
  });
});
