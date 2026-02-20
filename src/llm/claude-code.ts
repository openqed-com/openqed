import { spawn } from 'node:child_process';
import os from 'node:os';
import { debug, warn } from '../utils/logger.js';

export interface ClaudeCodeOptions {
  model?: string;
  timeoutMs?: number;
}

export async function generateViaClaude(
  prompt: string,
  opts: ClaudeCodeOptions = {},
): Promise<string> {
  const model = opts.model ?? 'sonnet';
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const args = [
    '-p',
    '--output-format',
    'json',
    '--model',
    model,
    '--max-turns',
    '1',
    '--allowedTools',
    '',
  ];

  debug(`Spawning claude with model=${model}, timeout=${timeoutMs}ms`);

  // Strip git env vars to avoid interference
  const env = { ...process.env };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  delete env.GIT_INDEX_FILE;

  return new Promise<string>((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: os.tmpdir(),
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`claude process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        warn(`claude exited with code ${code}: ${stderr.slice(0, 200)}`);
        reject(new Error(`claude exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout) as { result?: string };
        if (!parsed.result) {
          reject(new Error('claude returned empty result'));
          return;
        }
        resolve(parsed.result);
      } catch (e) {
        reject(
          new Error(`Failed to parse claude output: ${(e as Error).message}`),
        );
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    // Send prompt via stdin
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}
