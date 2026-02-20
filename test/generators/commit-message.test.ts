import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('../../src/git/diff.js', () => ({
  getStagedFiles: vi.fn(),
  getStagedDiff: vi.fn().mockResolvedValue('diff content'),
  getStagedDiffStat: vi.fn().mockResolvedValue('1 file changed, 5 insertions(+)'),
}));

vi.mock('../../src/git/log.js', () => ({
  getLastCommitTime: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/adapters/registry.js', () => ({
  getDefaultAdapter: vi.fn().mockReturnValue({
    findSessionsInRange: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../../src/llm/provider.js', () => ({
  generateText: vi.fn().mockResolvedValue(null),
}));

import { generateCommitMessage } from '../../src/generators/commit-message.js';
import { getStagedFiles } from '../../src/git/diff.js';
import type { Workspace } from '../../src/workspace/types.js';

const workspace: Workspace = {
  id: 'ws_test123456',
  type: 'git_repo',
  path: '/tmp/test-repo',
  name: 'test-repo',
};

describe('generateCommitMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses offline fallback when LLM returns null', async () => {
    vi.mocked(getStagedFiles).mockResolvedValue(['src/index.ts']);

    const result = await generateCommitMessage(workspace, { offline: true });
    expect(result.source).toBe('offline');
    expect(result.message).toBeTruthy();
  });

  it('includes trailers in result', async () => {
    vi.mocked(getStagedFiles).mockResolvedValue(['src/index.ts']);

    const result = await generateCommitMessage(workspace, { offline: true });
    expect(typeof result.trailers).toBe('string');
  });

  it('throws on no staged files', async () => {
    vi.mocked(getStagedFiles).mockResolvedValue([]);

    await expect(generateCommitMessage(workspace)).rejects.toThrow(
      'No staged files',
    );
  });

  it('includes sessionId in return value', async () => {
    vi.mocked(getStagedFiles).mockResolvedValue(['src/index.ts']);

    const result = await generateCommitMessage(workspace, { offline: true });
    expect('sessionId' in result).toBe(true);
  });
});
