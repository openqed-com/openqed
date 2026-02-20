import { extractHeuristicNuggets } from '../../src/extraction/heuristic.js';
import type { ParsedSession, AgentSession, Artifact, SessionEvent } from '../../src/adapters/types.js';

function makeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    id: 'test-session-001',
    workspace: { id: 'ws_test', type: 'git_repo', path: '/tmp/test' },
    agent: 'claude-code',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeParsed(overrides: Partial<ParsedSession> = {}): ParsedSession {
  return {
    session: makeSession(),
    events: [],
    artifacts: [],
    userPrompts: [],
    agentArtifactPaths: [],
    ...overrides,
  };
}

describe('heuristic extraction', () => {
  it('extracts intent from first prompt', () => {
    const parsed = makeParsed({
      userPrompts: ['Please add JWT authentication to the login endpoint'],
    });

    const nuggets = extractHeuristicNuggets(parsed);
    const intent = nuggets.find((n) => n.type === 'intent' && !n.scopePath);
    expect(intent).toBeDefined();
    expect(intent!.summary).toContain('add JWT authentication');
    expect(intent!.confidence).toBe(0.6);
  });

  it('extracts per-file intent from prompt mentions', () => {
    const parsed = makeParsed({
      userPrompts: ['update src/auth.ts to use JWT tokens'],
      agentArtifactPaths: ['src/auth.ts'],
      artifacts: [
        { type: 'file', path: 'src/auth.ts', changeType: 'modify', author: 'agent' },
      ],
    });

    const nuggets = extractHeuristicNuggets(parsed);
    const fileIntent = nuggets.find(
      (n) => n.type === 'intent' && n.scopePath === 'src/auth.ts' && n.confidence === 0.5,
    );
    expect(fileIntent).toBeDefined();
  });

  it('detects tuning from mixed-author artifacts', () => {
    const parsed = makeParsed({
      userPrompts: ['fix the auth module'],
      artifacts: [
        { type: 'file', path: 'src/auth.ts', changeType: 'modify', author: 'mixed' },
      ],
      agentArtifactPaths: ['src/auth.ts'],
    });

    const nuggets = extractHeuristicNuggets(parsed);
    const tuning = nuggets.find((n) => n.type === 'tuning');
    expect(tuning).toBeDefined();
    expect(tuning!.scopePath).toBe('src/auth.ts');
    expect(tuning!.confidence).toBe(0.65);
  });

  it('creates file scope nuggets for non-read artifacts', () => {
    const parsed = makeParsed({
      userPrompts: ['create a new module'],
      artifacts: [
        { type: 'file', path: 'src/new.ts', changeType: 'create', author: 'agent' },
        { type: 'file', path: 'src/old.ts', changeType: 'read', author: 'agent' },
      ],
      agentArtifactPaths: ['src/new.ts'],
    });

    const nuggets = extractHeuristicNuggets(parsed);
    const fileScopeNuggets = nuggets.filter(
      (n) => n.scopePath === 'src/new.ts' && n.summary.startsWith('created'),
    );
    expect(fileScopeNuggets.length).toBeGreaterThan(0);

    // Should NOT have a scope nugget for read-only file
    const readNuggets = nuggets.filter(
      (n) => n.scopePath === 'src/old.ts' && n.summary.startsWith('read'),
    );
    expect(readNuggets).toHaveLength(0);
  });

  it('has proper confidence ranges', () => {
    const parsed = makeParsed({
      userPrompts: ['fix the store module'],
      artifacts: [
        { type: 'file', path: 'src/store.ts', changeType: 'modify', author: 'agent' },
      ],
      agentArtifactPaths: ['src/store.ts'],
    });

    const nuggets = extractHeuristicNuggets(parsed);
    for (const nugget of nuggets) {
      expect(nugget.confidence).toBeGreaterThanOrEqual(0);
      expect(nugget.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('returns empty for empty session', () => {
    const parsed = makeParsed();
    const nuggets = extractHeuristicNuggets(parsed);
    expect(nuggets).toHaveLength(0);
  });
});
