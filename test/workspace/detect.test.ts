import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectWorkspace } from '../../src/workspace/detect.js';

describe('detectWorkspace', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'openqed-test-')));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects a git repository', async () => {
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'README.md'), 'hello');
    execSync('git add . && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });
    const ws = await detectWorkspace(tmpDir);
    expect(ws.type).toBe('git_repo');
    expect(ws.id).toMatch(/^ws_/);
    expect(ws.path).toBe(tmpDir);
  }, 15000);

  it('falls back to folder for non-git directory', async () => {
    const ws = await detectWorkspace(tmpDir);
    expect(ws.type).toBe('folder');
    expect(ws.id).toMatch(/^ws_/);
  });

  it('sets name from directory basename', async () => {
    const ws = await detectWorkspace(tmpDir);
    expect(ws.name).toBe(path.basename(tmpDir));
  });
});
