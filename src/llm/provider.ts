import { spawn } from 'node:child_process';
import type { LLMProvider } from './types.js';
import { generateViaClaude } from './claude-code.js';
import { warn } from '../utils/logger.js';

export interface GenerateTextOptions {
  model?: string;
  timeoutMs?: number;
}

export async function detectProvider(): Promise<LLMProvider> {
  return new Promise<LLMProvider>((resolve) => {
    const proc = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve('none');
    }, 5_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? 'claude-code' : 'none');
    });

    proc.on('error', () => {
      clearTimeout(timer);
      resolve('none');
    });
  });
}

export async function generateText(
  prompt: string,
  opts: GenerateTextOptions = {},
): Promise<string | null> {
  try {
    const provider = await detectProvider();
    if (provider === 'none') {
      warn('No LLM provider available');
      return null;
    }
    return await generateViaClaude(prompt, opts);
  } catch (err) {
    warn(`LLM generation failed: ${(err as Error).message}`);
    return null;
  }
}
