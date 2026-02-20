import { generateOfflineCommitMessage } from '../../src/llm/offline.js';
import type { ParsedSession } from '../../src/adapters/types.js';

function makeSession(prompts: string[]): ParsedSession {
  return {
    session: {
      id: 'test-session',
      workspace: { id: 'ws_test', type: 'git_repo', path: '/test', name: 'test' },
      agent: 'claude-code',
      startedAt: new Date(),
    },
    events: [],
    artifacts: [],
    userPrompts: prompts,
    agentArtifactPaths: [],
  };
}

describe('generateOfflineCommitMessage', () => {
  it('produces conventional commit format with body', () => {
    const msg = generateOfflineCommitMessage(
      null,
      ['src/index.ts'],
      '1 file changed, 5 insertions(+)',
    );
    const subjectLine = msg.split('\n')[0];
    // Subject should match conventional format
    expect(subjectLine).toMatch(/^\w+(\(\w+\))?: .+/);
    // Should have a body separated by blank line
    expect(msg).toContain('\n\n');
  });

  it('uses session prompt as subject', () => {
    const session = makeSession(['Add user authentication']);
    const msg = generateOfflineCommitMessage(
      session,
      ['src/auth.ts'],
      '1 file changed, 30 insertions(+)',
    );
    expect(msg.toLowerCase()).toContain('add user authentication');
  });

  it('truncates subject line to 72 characters', () => {
    const session = makeSession([
      'Implement a very long feature description that goes way beyond the normal commit message length limit and should definitely be truncated',
    ]);
    const msg = generateOfflineCommitMessage(
      session,
      ['src/feature.ts'],
      '1 file changed, 100 insertions(+)',
    );
    const subjectLine = msg.split('\n')[0];
    expect(subjectLine.length).toBeLessThanOrEqual(72);
  });

  it('falls back to file description without session', () => {
    const msg = generateOfflineCommitMessage(
      null,
      ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      '3 files changed, 15 insertions(+)',
    );
    expect(msg).toContain('3 files');
  });
});
