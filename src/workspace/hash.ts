import { createHash } from 'node:crypto';
import type { WorkspaceType } from './types.js';

export function hashWorkspace(type: WorkspaceType, absPath: string): string {
  const normalized = absPath.replace(/\/+$/, '');
  const hash = createHash('sha256')
    .update(`${type}:${normalized}`)
    .digest('hex');
  return `ws_${hash.slice(0, 12)}`;
}
