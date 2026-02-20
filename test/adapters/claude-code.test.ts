import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claudeCodeAdapter } from '../../src/adapters/claude-code.js';
import type { Workspace } from '../../src/workspace/types.js';
import type { AgentSession } from '../../src/adapters/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'claude-code');

const testWorkspace: Workspace = {
  id: 'ws_fixture_test',
  type: 'git_repo',
  path: '/Users/test/project',
  name: 'project',
};

function makeSession(filename: string, sessionId: string): AgentSession {
  return {
    id: sessionId,
    workspace: testWorkspace,
    agent: 'claude-code',
    startedAt: new Date('2025-01-15T10:00:00Z'),
    rawPath: path.join(FIXTURE_DIR, filename),
  };
}

describe('claude-code adapter: parse simple session', () => {
  it('extracts user prompts', async () => {
    const session = makeSession('simple-session.jsonl', 'session-simple-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    expect(parsed.userPrompts).toHaveLength(1);
    expect(parsed.userPrompts[0]).toContain('hello world');
  });

  it('extracts artifacts from Write tool calls', async () => {
    const session = makeSession('simple-session.jsonl', 'session-simple-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    expect(parsed.artifacts).toHaveLength(2);

    const paths = parsed.artifacts.map((a) => a.path);
    expect(paths).toContain('src/hello.ts');
    expect(paths).toContain('README.md');
  });

  it('tracks token usage', async () => {
    const session = makeSession('simple-session.jsonl', 'session-simple-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    expect(parsed.session.totalTokens).toBeGreaterThan(0);
  });

  it('sets agentArtifactPaths for write operations only', async () => {
    const session = makeSession('simple-session.jsonl', 'session-simple-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    expect(parsed.agentArtifactPaths).toContain('src/hello.ts');
    expect(parsed.agentArtifactPaths).toContain('README.md');
  });
});

describe('claude-code adapter: parse multi-prompt session', () => {
  it('extracts multiple user prompts', async () => {
    const session = makeSession('multi-prompt-session.jsonl', 'session-multi-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    expect(parsed.userPrompts).toHaveLength(3);
    expect(parsed.userPrompts[0]).toContain('date utility');
  });

  it('skips progress events', async () => {
    const session = makeSession('multi-prompt-session.jsonl', 'session-multi-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    // Progress events should not appear as events
    const progressEvents = parsed.events.filter(
      (e) => e.content === 'Processing...',
    );
    expect(progressEvents).toHaveLength(0);
  });

  it('skips thinking blocks', async () => {
    const session = makeSession('multi-prompt-session.jsonl', 'session-multi-001');
    const parsed = await claudeCodeAdapter.parseSession(session);
    const thinkingEvents = parsed.events.filter(
      (e) => e.content?.includes('I should create'),
    );
    expect(thinkingEvents).toHaveLength(0);
  });

  it('handles Write, Edit, and Read tool calls', async () => {
    const session = makeSession('multi-prompt-session.jsonl', 'session-multi-001');
    const parsed = await claudeCodeAdapter.parseSession(session);

    const artifactPaths = parsed.artifacts.map((a) => a.path);
    expect(artifactPaths).toContain('src/utils/date.ts');
    expect(artifactPaths).toContain('src/utils/index.ts');
  });

  it('excludes read-only artifacts from agentArtifactPaths', async () => {
    const session = makeSession('multi-prompt-session.jsonl', 'session-multi-001');
    const parsed = await claudeCodeAdapter.parseSession(session);

    // index.ts was only Read, not Write/Edit
    expect(parsed.agentArtifactPaths).not.toContain('src/utils/index.ts');
    // date.ts was Written then Edited
    expect(parsed.agentArtifactPaths).toContain('src/utils/date.ts');
  });
});
