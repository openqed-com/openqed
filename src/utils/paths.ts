import path from 'node:path';
import os from 'node:os';

export const CLAUDE_PROJECTS_DIR = path.join(
  os.homedir(),
  '.claude',
  'projects',
);

export const OPENQED_DIR = path.join(os.homedir(), '.openqed');

export const OPENQED_DB_PATH = path.join(OPENQED_DIR, 'store.db');

/**
 * Convert an absolute path to a Claude-style project hash.
 * Replaces all `/` with `-`.
 * e.g. `/Users/bill/code/myapp` → `-Users-bill-code-myapp`
 */
export function projectHash(absPath: string): string {
  return absPath.replace(/\//g, '-');
}

/**
 * Get the Claude projects directory for a given absolute path.
 */
export function getProjectDir(absPath: string): string {
  return path.join(CLAUDE_PROJECTS_DIR, projectHash(absPath));
}
