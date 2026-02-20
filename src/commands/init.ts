import { Command } from 'commander';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { installPrepareCommitMsg } from '../git/hooks.js';
import {
  OPENQED_DIR,
  OPENQED_DATA_SUBDIR,
  OPENQED_LOCAL_SUBDIR,
} from '../utils/paths.js';
import { writeDefaultConfig } from '../export/config.js';
import { OPENQED_CONFIG_FILE } from '../utils/paths.js';
import { getStore } from '../store/index.js';
import { upsertWorkspace } from '../store/store.js';

async function ensureGitignore(
  repoPath: string,
  entry: string,
): Promise<void> {
  const gitignorePath = path.join(repoPath, '.gitignore');
  let content = '';
  try {
    content = await fs.readFile(gitignorePath, 'utf-8');
  } catch {
    // No .gitignore yet
  }

  const lines = content.split('\n');

  // Migrate: if `.openqed/` exists, replace it with `.openqed/local/`
  const oldEntry = '.openqed/';
  const oldIndex = lines.findIndex((line) => line.trim() === oldEntry);
  if (oldEntry !== entry && oldIndex !== -1) {
    lines[oldIndex] = entry;
    await fs.writeFile(gitignorePath, lines.join('\n'));
    return;
  }

  if (!lines.some((line) => line.trim() === entry)) {
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    await fs.writeFile(gitignorePath, content + sep + entry + '\n');
  }
}

async function runInit(options: { force?: boolean }): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());

  if (workspace.type !== 'git_repo') {
    console.error(
      chalk.red('Error: openqed init must be run inside a git repository.'),
    );
    process.exitCode = 1;
    return;
  }

  // Create global openqed directory
  await fs.mkdir(OPENQED_DIR, { recursive: true });
  console.log(chalk.green('✓') + ` Created ${OPENQED_DIR}`);

  // Create local .openqed/data/ and .openqed/local/ directories
  const dataDir = path.join(workspace.path, OPENQED_DATA_SUBDIR);
  const localDir = path.join(workspace.path, OPENQED_LOCAL_SUBDIR);
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(localDir, { recursive: true });
  console.log(chalk.green('✓') + ` Created ${dataDir}`);
  console.log(chalk.green('✓') + ` Created ${localDir}`);

  // Register workspace in the store
  try {
    const db = getStore();
    upsertWorkspace(db, workspace);
    console.log(chalk.green('✓') + ' Registered workspace in store');
  } catch {
    // Store may not be initialized yet — non-fatal
  }

  // Write default config.yml if not present
  const configPath = path.join(workspace.path, OPENQED_CONFIG_FILE);
  if (!fsSync.existsSync(configPath)) {
    writeDefaultConfig(workspace.path);
    console.log(chalk.green('✓') + ` Created ${configPath}`);
  }

  // Ensure .openqed/local/ is in .gitignore (migrates from .openqed/ if needed)
  await ensureGitignore(workspace.path, '.openqed/local/');
  console.log(chalk.green('✓') + ' Updated .gitignore');

  // Install git hook
  const installed = await installPrepareCommitMsg(
    workspace.path,
    options.force,
  );
  if (installed) {
    console.log(chalk.green('✓') + ' Installed prepare-commit-msg hook');
  } else {
    console.log(
      chalk.yellow('⚠') +
        ' Existing prepare-commit-msg hook found. Use --force to overwrite.',
    );
  }

  // Check for existing JSONL data (e.g. cloned repo)
  const jsonlFiles = ['nuggets.jsonl', 'sessions.jsonl', 'decisions.jsonl', 'artifacts.jsonl'];
  const hasData = jsonlFiles.some((f) => fsSync.existsSync(path.join(dataDir, f)));
  if (hasData) {
    console.log(
      chalk.cyan('\nFound exported data. Run ') +
        chalk.bold('openqed import') +
        chalk.cyan(' to load into local store.'),
    );
  }

  console.log(chalk.green('\nopenqed initialized successfully!'));
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize openqed in the current git repository')
    .option('--force', 'Overwrite existing git hooks')
    .action(runInit);
}
