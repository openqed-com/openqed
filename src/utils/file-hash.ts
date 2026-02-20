import { createHash } from 'node:crypto';
import fs from 'node:fs';

export function hashFileSync(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath);
    const hash = createHash('sha256').update(content).digest('hex');
    return hash.slice(0, 16);
  } catch {
    return null;
  }
}
