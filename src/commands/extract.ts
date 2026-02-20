import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { detectWorkspace } from '../workspace/detect.js';
import { getStore } from '../store/index.js';
import { getDefaultAdapter } from '../adapters/registry.js';
import { upsertWorkspace, upsertSession } from '../store/store.js';
import { ensureNuggetsExtracted, extractBatch } from '../extraction/scheduler.js';

async function runExtract(options: {
  all?: boolean;
  session?: string;
  force?: boolean;
  dryRun?: boolean;
  llm?: boolean;
  model?: string;
}): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const db = getStore();
  const adapter = getDefaultAdapter();

  // Ensure workspace exists in DB
  upsertWorkspace(db, workspace);

  const spinner = ora('Finding sessions...').start();

  try {
    let sessions;
    if (options.session) {
      const allSessions = await adapter.findSessions(workspace);
      const found = allSessions.find(
        (s) => s.id === options.session || s.id.startsWith(options.session!),
      );
      if (!found) {
        spinner.fail(`Session not found: ${options.session}`);
        process.exitCode = 1;
        return;
      }
      sessions = [found];
    } else {
      sessions = await adapter.findSessions(workspace);
    }

    spinner.text = `Parsing ${sessions.length} session(s)...`;

    const parsed = [];
    for (const session of sessions) {
      upsertSession(db, session);
      const p = await adapter.parseSession(session);
      parsed.push(p);
    }

    spinner.text = `Extracting nuggets from ${parsed.length} session(s)...`;

    const result = await extractBatch(db, parsed, {
      force: options.force,
      llm: options.llm,
      model: options.model,
      dryRun: options.dryRun,
    });

    spinner.stop();

    console.log(chalk.bold('\nExtraction Results:'));
    console.log(`  ${chalk.green(`Extracted: ${result.extracted}`)}`);
    console.log(`  ${chalk.gray(`Skipped:   ${result.skipped}`)}`);
    if (result.failed > 0) {
      console.log(`  ${chalk.red(`Failed:    ${result.failed}`)}`);
    }
    if (options.dryRun) {
      console.log(chalk.yellow('\n(dry run — no changes made)'));
    }
  } catch (err) {
    spinner.fail(`Extraction failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

export function createExtractCommand(): Command {
  return new Command('extract')
    .description('Extract context nuggets from sessions')
    .option('--all', 'extract from all sessions')
    .option('--session <id>', 'extract from a specific session')
    .option('--force', 'force re-extraction even if already extracted')
    .option('--dry-run', 'show what would be extracted without doing it')
    .option('--llm', 'use LLM for higher-quality extraction')
    .option('--model <model>', 'LLM model to use (e.g. haiku, sonnet, opus)', 'sonnet')
    .action(runExtract);
}
