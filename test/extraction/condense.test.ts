import { condenseForExtraction } from '../../src/extraction/condense.js';
import type { ParsedSession, SessionEvent } from '../../src/adapters/types.js';

function makeParsed(events: SessionEvent[]): ParsedSession {
  return {
    session: {
      id: 'test-session',
      workspace: { id: 'ws_test', type: 'git_repo', path: '/tmp/test' },
      agent: 'claude-code',
      startedAt: new Date('2025-01-15T10:00:00Z'),
      endedAt: new Date('2025-01-15T10:30:00Z'),
    },
    events,
    artifacts: [],
    userPrompts: [],
    agentArtifactPaths: [],
  };
}

function makeEvent(overrides: Partial<SessionEvent>): SessionEvent {
  return {
    type: 'user_prompt',
    timestamp: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  };
}

describe('condenseForExtraction', () => {
  it('keeps user prompts verbatim', () => {
    const parsed = makeParsed([
      makeEvent({ type: 'user_prompt', content: 'Please add JWT auth to the login endpoint' }),
    ]);

    const result = condenseForExtraction(parsed);
    expect(result).toContain('Please add JWT auth to the login endpoint');
  });

  it('includes Write/Edit with truncated content', () => {
    const longContent = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    const parsed = makeParsed([
      makeEvent({
        type: 'tool_call',
        toolName: 'Write',
        toolInput: { file_path: 'src/auth.ts', content: longContent },
      }),
    ]);

    const result = condenseForExtraction(parsed);
    expect(result).toContain('[Write] src/auth.ts');
    expect(result).toContain('line 1');
    expect(result).toContain('line 20');
    expect(result).toContain('omitted');
  });

  it('includes Bash with command and truncated output', () => {
    const parsed = makeParsed([
      makeEvent({
        type: 'tool_call',
        toolName: 'Bash',
        toolInput: { command: 'npm test' },
        toolOutput: 'All tests passed\nDone in 2.3s',
      }),
    ]);

    const result = condenseForExtraction(parsed);
    expect(result).toContain('[Bash] $ npm test');
    expect(result).toContain('All tests passed');
  });

  it('skips Read tool calls', () => {
    const parsed = makeParsed([
      makeEvent({
        type: 'tool_call',
        toolName: 'Read',
        toolInput: { file_path: 'src/config.ts' },
      }),
    ]);

    const result = condenseForExtraction(parsed);
    expect(result).not.toContain('[Read]');
    expect(result).not.toContain('config.ts');
  });

  it('skips short assistant text', () => {
    const parsed = makeParsed([
      makeEvent({ type: 'assistant_text', content: 'OK' }),
    ]);

    const result = condenseForExtraction(parsed);
    expect(result).not.toContain('OK');
  });

  it('includes long assistant text truncated', () => {
    const longText = 'A'.repeat(300);
    const parsed = makeParsed([
      makeEvent({ type: 'assistant_text', content: longText }),
    ]);

    const result = condenseForExtraction(parsed);
    expect(result).toContain('[Assistant]');
    expect(result).toContain('...');
  });
});
