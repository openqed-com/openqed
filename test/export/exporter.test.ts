import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MIGRATIONS } from '../../src/store/schema.js';
import { upsertWorkspace, upsertSession, insertArtifact } from '../../src/store/store.js';
import { insertNugget } from '../../src/store/nuggets.js';
import { exportWorkspace } from '../../src/export/exporter.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession } from '../../src/adapters/types.js';
import type { ExportConfig } from '../../src/export/config.js';
import type { NuggetRecord, SessionRecord, ArtifactRecord } from '../../src/export/types.js';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    db.exec(migration.up);
  }
  return db;
}

const workspace: Workspace = {
  id: 'ws_export_test',
  type: 'git_repo',
  path: '/tmp/export-test',
  name: 'export-test',
};

const otherWorkspace: Workspace = {
  id: 'ws_other',
  type: 'git_repo',
  path: '/tmp/other-test',
  name: 'other-test',
};

function makeSession(id: string, ws: Workspace = workspace): AgentSession {
  return {
    id,
    workspace: ws,
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

describe('exporter', () => {
  let db: ReturnType<typeof Database>;
  let tmpDir: string;

  beforeEach(() => {
    db = createTestDb();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oqed-export-'));
    upsertWorkspace(db, workspace);
    upsertWorkspace(db, otherWorkspace);
    upsertSession(db, makeSession('s1'));
    upsertSession(db, makeSession('s2'));
    upsertSession(db, makeSession('s_other', otherWorkspace));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports sessions as JSONL', () => {
    const summary = exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    expect(summary.sessions).toBe(2);

    const content = fs.readFileSync(path.join(tmpDir, '.openqed/data/sessions.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);

    const record = JSON.parse(lines[0]) as SessionRecord;
    expect(record._v).toBe(1);
    expect(record.agent).toBe('claude-code');
  });

  it('exports nuggets as JSONL', () => {
    insertNugget(db, {
      sessionId: 's1',
      type: 'intent',
      summary: 'test summary',
      detail: 'test detail',
      confidence: 0.9,
      extractedAt: '2025-01-15T10:15:00Z',
    });

    const summary = exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    expect(summary.nuggets).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'), 'utf-8');
    const record = JSON.parse(content.trim()) as NuggetRecord;
    expect(record._v).toBe(1);
    expect(record.summary).toBe('test summary');
    expect(record.session_id).toBe('s1');
  });

  it('exports artifacts as JSONL', () => {
    insertArtifact(db, 's1', {
      type: 'file',
      path: 'src/foo.ts',
      changeType: 'modify',
      author: 'agent',
    });

    const summary = exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    expect(summary.artifacts).toBe(1);

    const content = fs.readFileSync(path.join(tmpDir, '.openqed/data/artifacts.jsonl'), 'utf-8');
    const record = JSON.parse(content.trim()) as ArtifactRecord;
    expect(record.path).toBe('src/foo.ts');
    expect(record.change_type).toBe('modify');
  });

  it('scopes export to workspace', () => {
    insertNugget(db, {
      sessionId: 's_other',
      type: 'intent',
      summary: 'other workspace nugget',
      confidence: 0.8,
      extractedAt: '2025-01-15T10:15:00Z',
    });
    insertNugget(db, {
      sessionId: 's1',
      type: 'intent',
      summary: 'this workspace nugget',
      confidence: 0.8,
      extractedAt: '2025-01-15T10:15:00Z',
    });

    const summary = exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    expect(summary.nuggets).toBe(1);
    expect(summary.sessions).toBe(2);
  });

  it('produces idempotent output', () => {
    insertNugget(db, {
      sessionId: 's1',
      type: 'decision',
      summary: 'chose approach A',
      confidence: 0.95,
      extractedAt: '2025-01-15T10:15:00Z',
    });

    exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    const first = fs.readFileSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'), 'utf-8');

    exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    const second = fs.readFileSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'), 'utf-8');

    expect(first).toBe(second);
  });

  it('applies redaction to content fields', () => {
    insertNugget(db, {
      sessionId: 's1',
      type: 'intent',
      summary: 'used key sk-abcdefghijklmnopqrstuvwxyz',
      detail: 'token ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa found',
      confidence: 0.8,
      extractedAt: '2025-01-15T10:15:00Z',
    });

    exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    const content = fs.readFileSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'), 'utf-8');
    const record = JSON.parse(content.trim()) as NuggetRecord;

    expect(record.summary).toContain('[REDACTED]');
    expect(record.summary).not.toContain('sk-abcdefghijklmnopqrstuvwxyz');
    expect(record.detail).toContain('[REDACTED]');
  });

  it('creates empty files for tables with no data', () => {
    const summary = exportWorkspace(db, workspace.id, tmpDir, fullConfig);
    expect(summary.nuggets).toBe(0);
    expect(summary.decisions).toBe(0);
    expect(summary.artifacts).toBe(0);

    // Files should exist but be empty
    expect(fs.existsSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'))).toBe(true);
    expect(fs.readFileSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'), 'utf-8')).toBe('');
  });

  it('respects config to skip types', () => {
    const partialConfig: ExportConfig = {
      nuggets: true,
      sessions: false,
      decisions: false,
      artifacts: false,
      events: false,
    };

    exportWorkspace(db, workspace.id, tmpDir, partialConfig);
    expect(fs.existsSync(path.join(tmpDir, '.openqed/data/nuggets.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.openqed/data/sessions.jsonl'))).toBe(false);
  });
});
