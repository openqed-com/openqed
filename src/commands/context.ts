import { Command } from 'commander';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { getStore } from '../store/index.js';
import { upsertWorkspace } from '../store/store.js';
import { queryContext } from '../context/query.js';
import type { ContextQuery, NuggetType } from '../context/types.js';

async function runContext(
  pathArg: string | undefined,
  options: {
    symbol?: string;
    query?: string;
    budget?: string;
    type?: string;
    depth?: string;
    since?: string;
    json?: boolean;
  },
): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const db = getStore();
  upsertWorkspace(db, workspace);

  const tokenBudget = options.budget ? parseInt(options.budget, 10) : 2000;
  const depth = (options.depth ?? 'standard') as 'summary' | 'standard' | 'deep';
  const types = options.type
    ? (options.type.split(',') as NuggetType[])
    : undefined;

  if (!pathArg && !options.query) {
    console.error(chalk.red('Provide a <path> or --query'));
    process.exitCode = 1;
    return;
  }

  const query: ContextQuery = {
    path: pathArg,
    symbol: options.symbol,
    query: options.query,
    tokenBudget,
    types,
    depth,
    workspaceId: workspace.id,
  };

  if (options.since) {
    query.since = new Date(options.since);
  }

  const response = await queryContext(db, query, workspace.path);

  if (options.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  // Pretty-print
  if (response.nuggets.length === 0) {
    console.log(chalk.yellow('No context nuggets found.'));
    if (response.moreContextHint) {
      console.log(chalk.gray(response.moreContextHint));
    }
    return;
  }

  console.log(
    chalk.bold(`Context for ${pathArg ?? options.query} (${response.nuggets.length} nuggets, ${response.budget.used} tokens)`),
  );
  console.log('');

  for (const nugget of response.nuggets) {
    const typeColor =
      nugget.type === 'constraint' || nugget.type === 'caveat'
        ? chalk.red
        : nugget.type === 'decision' || nugget.type === 'rejection'
          ? chalk.yellow
          : chalk.cyan;
    const staleTag = nugget.stale ? chalk.gray(' [stale]') : '';
    console.log(`  ${typeColor(`[${nugget.type}]`)} ${nugget.summary}${staleTag}`);
    if (nugget.detail) {
      console.log(`    ${chalk.gray(nugget.detail)}`);
    }
    console.log(`    ${chalk.gray(`${nugget.scope} | ${nugget.sessionAgent} | ${nugget.sessionDate.slice(0, 10)}`)}`);
    console.log('');
  }

  if (response.budget.truncated) {
    console.log(chalk.gray(`Budget: ${response.budget.used}/${response.budget.requested} tokens used`));
  }
  if (response.moreContextHint) {
    console.log(chalk.gray(response.moreContextHint));
  }
}

export function createContextCommand(): Command {
  return new Command('context')
    .description('Query context for a file or topic')
    .argument('[path]', 'file path to query context for')
    .option('--symbol <name>', 'specific symbol (function, class) to query')
    .option('--query <text>', 'natural language query')
    .option('--budget <tokens>', 'token budget (default: 2000)', '2000')
    .option('--type <types>', 'filter by nugget types (comma-separated)')
    .option('--depth <level>', 'detail level: summary, standard, deep', 'standard')
    .option('--since <date>', 'only include nuggets since date')
    .option('--json', 'output as JSON')
    .action(runContext);
}
