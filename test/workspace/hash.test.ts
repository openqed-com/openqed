import { hashWorkspace } from '../../src/workspace/hash.js';

describe('hashWorkspace', () => {
  it('returns deterministic IDs', () => {
    const a = hashWorkspace('git_repo', '/Users/bill/code/myapp');
    const b = hashWorkspace('git_repo', '/Users/bill/code/myapp');
    expect(a).toBe(b);
  });

  it('prefixes with ws_', () => {
    const id = hashWorkspace('git_repo', '/some/path');
    expect(id).toMatch(/^ws_[a-f0-9]{12}$/);
  });

  it('produces different IDs for different types', () => {
    const gitId = hashWorkspace('git_repo', '/same/path');
    const folderId = hashWorkspace('folder', '/same/path');
    expect(gitId).not.toBe(folderId);
  });

  it('normalizes trailing slashes', () => {
    const a = hashWorkspace('git_repo', '/path/to/repo/');
    const b = hashWorkspace('git_repo', '/path/to/repo');
    expect(a).toBe(b);
  });
});
