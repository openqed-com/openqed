import { Command } from 'commander';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import { simpleGit } from 'simple-git';
import { detectWorkspace } from '../workspace/detect.js';
import { generateCommitMessage } from '../generators/commit-message.js';
import { getStagedFiles } from '../git/diff.js';
import { debug } from '../utils/logger.js';

interface CommitOptions {
  auto?: boolean;
  dryRun?: boolean;
  hook?: string;
  model?: string;
  offline?: boolean;
}

async function interactiveCommit(
  repoPath: string,
  message: string,
): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
  const tmpFile = path.join(
    os.tmpdir(),
    `openqed-commit-${Date.now()}.txt`,
  );

  await fs.writeFile(tmpFile, message);

  try {
    execSync(`${editor} "${tmpFile}"`, { stdio: 'inherit' });
    const edited = await fs.readFile(tmpFile, 'utf-8');
    const trimmed = edited.trim();

    if (!trimmed) {
      console.log(chalk.yellow('Empty commit message, aborting.'));
      return null;
    }

    const git = simpleGit(repoPath);
    const result = await git.commit(trimmed);
    return result.commit || null;
  } finally {
    try {
      await fs.unlink(tmpFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

function persistOutputLink(
  sessionId: string | null,
  commitSha: string,
): void {
  if (!sessionId) return;

  try {
    // Best-effort: dynamically import store to avoid hard failure if DB not initialized
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getStore } = require('../store/index.js') as {
      getStore: () => import('better-sqlite3').Database;
    };
    const { insertOutputLink } = require('../store/store.js') as {
      insertOutputLink: (
        db: import('better-sqlite3').Database,
        sessionId: string,
        outputType: string,
        outputRef: string,
        autoLinked?: boolean,
      ) => number;
    };

    const db = getStore();
    insertOutputLink(db, sessionId, 'commit', commitSha, true);
    debug(`Linked commit ${commitSha} to session ${sessionId}`);
  } catch {
    debug('Could not persist output link (store may not be initialized)');
  }
}

async function runCommit(options: CommitOptions): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());

  if (workspace.type !== 'git_repo') {
    console.error(chalk.red('Error: must be run inside a git repository.'));
    process.exitCode = 1;
    return;
  }

  // Check for staged files (unless in hook mode, where we trust the caller)
  if (!options.hook) {
    const staged = await getStagedFiles(workspace.path);
    if (staged.length === 0) {
      console.error(
        chalk.red('No staged files. Stage changes with `git add` first.'),
      );
      process.exitCode = 1;
      return;
    }
  }

  // Show spinner unless in hook mode
  const spinner = options.hook
    ? null
    : ora('Generating commit message...').start();

  let result;
  try {
    result = await generateCommitMessage(workspace, {
      model: options.model,
      offline: options.offline,
    });

    spinner?.succeed('Commit message generated');
  } catch (err) {
    spinner?.fail('Failed to generate commit message');
    console.error(chalk.red((err as Error).message));
    process.exitCode = 1;
    return;
  }

  const fullMessage = result.trailers
    ? `${result.message}\n\n${result.trailers}`
    : result.message;

  // Mode dispatch
  if (options.dryRun) {
    console.log(fullMessage);
    return;
  }

  if (options.hook) {
    await fs.writeFile(options.hook, fullMessage);
    return;
  }

  if (options.auto) {
    const git = simpleGit(workspace.path);
    const commitResult = await git.commit(fullMessage);
    const sha = commitResult.commit;

    if (sha) {
      console.log(chalk.green(`Created commit ${sha}`));
      persistOutputLink(result.sessionId, sha);
    } else {
      console.log(chalk.yellow('No commit created.'));
    }
    return;
  }

  // Default: interactive mode
  const sha = await interactiveCommit(workspace.path, fullMessage);
  if (sha) {
    console.log(chalk.green(`Created commit ${sha}`));
    persistOutputLink(result.sessionId, sha);
  }
}

export function createCommitCommand(): Command {
  return new Command('commit')
    .description('Generate an AI-attributed commit message')
    .option('--auto', 'Automatically commit without editing')
    .option('--dry-run', 'Print the commit message without committing')
    .option('--hook <file>', 'Write message to file (for git hook mode)')
    .option('--model <model>', 'LLM model to use for generation')
    .option('--offline', 'Use offline heuristic generation (no LLM)')
    .action(runCommit);
}
