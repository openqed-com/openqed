import fs from 'node:fs/promises';
import path from 'node:path';

const HOOK_SCRIPT = `#!/bin/sh
# openqed prepare-commit-msg hook
# Generates AI-attributed commit messages

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"

# Skip for merge, squash, amend, or message-provided commits
if [ -n "$COMMIT_SOURCE" ]; then
  exit 0
fi

# Gracefully no-op if openqed is not installed
if ! command -v openqed >/dev/null 2>&1; then
  exit 0
fi

openqed commit --hook "$COMMIT_MSG_FILE"
`;

export async function installPrepareCommitMsg(
  repoPath: string,
  force = false,
): Promise<boolean> {
  const hooksDir = path.join(repoPath, '.git', 'hooks');
  const hookPath = path.join(hooksDir, 'prepare-commit-msg');

  // Ensure hooks directory exists
  await fs.mkdir(hooksDir, { recursive: true });

  // Check for existing hook
  if (!force) {
    try {
      const existing = await fs.readFile(hookPath, 'utf-8');
      if (existing && !existing.includes('openqed')) {
        return false;
      }
    } catch {
      // File doesn't exist — fine to install
    }
  }

  await fs.writeFile(hookPath, HOOK_SCRIPT, { mode: 0o755 });
  return true;
}

export async function isHookInstalled(repoPath: string): Promise<boolean> {
  const hookPath = path.join(repoPath, '.git', 'hooks', 'prepare-commit-msg');
  try {
    const content = await fs.readFile(hookPath, 'utf-8');
    return content.includes('openqed');
  } catch {
    return false;
  }
}
