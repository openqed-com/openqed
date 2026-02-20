import { Command } from 'commander';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { getStore } from '../store/index.js';
import { findNuggetsByWorkspace, findNuggetsByScope } from '../store/nuggets.js';
import type { NuggetType } from '../context/types.js';

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

async function runNuggetsList(options: {
  file?: string;
  type?: string;
  stale?: boolean;
  json?: boolean;
  limit?: string;
}): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const db = getStore();

  const limit = options.limit ? parseInt(options.limit, 10) : 50;
  const types = options.type
    ? (options.type.split(',') as NuggetType[])
    : undefined;

  let nuggets;
  if (options.file) {
    nuggets = findNuggetsByScope(db, workspace.id, {
      scopePath: options.file,
      types: types as string[],
      limit,
    });
  } else {
    nuggets = findNuggetsByWorkspace(db, workspace.id, {
      types: types as string[],
      limit,
    });
  }

  if (options.json) {
    console.log(JSON.stringify(nuggets, null, 2));
    return;
  }

  if (nuggets.length === 0) {
    console.log(chalk.yellow('No nuggets found. Run `openqed extract` first.'));
    return;
  }

  // Table header
  console.log(
    chalk.bold(
      `${'ID'.padEnd(6)} ${'Type'.padEnd(12)} ${'Scope'.padEnd(30)} Summary`,
    ),
  );
  console.log('─'.repeat(90));

  for (const nugget of nuggets) {
    const scope = nugget.scopePath ?? nugget.scopeSymbol ?? '(workspace)';
    console.log(
      `${String(nugget.id).padEnd(6)} ${nugget.type.padEnd(12)} ${truncate(scope, 28).padEnd(30)} ${truncate(nugget.summary, 40)}`,
    );
  }

  console.log(`\n${nuggets.length} nugget(s) found.`);
}

async function runNuggetsInspect(id: string): Promise<void> {
  const db = getStore();

  const row = db
    .prepare('SELECT * FROM context_nuggets WHERE id = ?')
    .get(parseInt(id, 10)) as Record<string, unknown> | undefined;

  if (!row) {
    console.error(chalk.red(`Nugget not found: ${id}`));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold('ID:         ') + row.id);
  console.log(chalk.bold('Type:       ') + row.type);
  console.log(chalk.bold('Summary:    ') + row.summary);
  if (row.detail) {
    console.log(chalk.bold('Detail:     ') + row.detail);
  }
  if (row.scope_path) {
    console.log(chalk.bold('Scope Path: ') + row.scope_path);
  }
  if (row.scope_symbol) {
    console.log(chalk.bold('Symbol:     ') + row.scope_symbol);
  }
  console.log(chalk.bold('Confidence: ') + row.confidence);
  console.log(chalk.bold('Session:    ') + row.session_id);
  console.log(chalk.bold('Extracted:  ') + row.extracted_at);
  if (row.metadata) {
    console.log(chalk.bold('Metadata:   ') + row.metadata);
  }
}

export function createNuggetsCommand(): Command {
  const cmd = new Command('nuggets')
    .description('List and inspect extracted context nuggets')
    .option('--file <path>', 'filter by file path')
    .option('--type <types>', 'filter by type (comma-separated)')
    .option('--stale', 'show only stale nuggets')
    .option('--json', 'output as JSON')
    .option('--limit <n>', 'max nuggets to show (default: 50)', '50')
    .action(runNuggetsList);

  cmd
    .command('inspect <id>')
    .description('Inspect a specific nugget')
    .action(runNuggetsInspect);

  return cmd;
}
