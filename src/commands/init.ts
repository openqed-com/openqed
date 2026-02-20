import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { installPrepareCommitMsg } from '../git/hooks.js';
import { OPENQED_DIR } from '../utils/paths.js';

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

  if (!content.split('\n').some((line) => line.trim() === entry)) {
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

  // Create local .openqed directory
  const localDir = path.join(workspace.path, '.openqed');
  await fs.mkdir(localDir, { recursive: true });
  console.log(chalk.green('✓') + ` Created ${localDir}`);

  // Ensure .openqed/ is in .gitignore
  await ensureGitignore(workspace.path, '.openqed/');
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

  console.log(chalk.green('\nopenqed initialized successfully!'));
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize openqed in the current git repository')
    .option('--force', 'Overwrite existing git hooks')
    .action(runInit);
}
