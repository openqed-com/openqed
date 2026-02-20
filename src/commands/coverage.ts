import { Command } from 'commander';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { getStore } from '../store/index.js';
import { getQueryGaps } from '../store/nuggets.js';

async function runCoverage(options: { gaps?: boolean }): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const db = getStore();

  if (options.gaps) {
    const gaps = getQueryGaps(db, workspace.id);
    if (gaps.length === 0) {
      console.log(chalk.yellow('No query gaps found.'));
      return;
    }

    console.log(chalk.bold('Files with high queries but low nugget coverage:\n'));
    console.log(
      chalk.bold(`${'Path'.padEnd(50)} ${'Queries'.padEnd(10)} Nuggets`),
    );
    console.log('─'.repeat(70));

    for (const gap of gaps) {
      console.log(
        `${gap.path.padEnd(50)} ${String(gap.queryCount).padEnd(10)} ${gap.nuggetCount}`,
      );
    }
    return;
  }

  // Bar chart of nugget coverage per file
  const rows = db.prepare(
    `SELECT cn.scope_path as path, COUNT(*) as count
     FROM context_nuggets cn
     JOIN sessions s ON cn.session_id = s.id
     WHERE s.workspace_id = ? AND cn.scope_path IS NOT NULL
     GROUP BY cn.scope_path
     ORDER BY count DESC
     LIMIT 30`,
  ).all(workspace.id) as Array<{ path: string; count: number }>;

  if (rows.length === 0) {
    console.log(chalk.yellow('No nuggets found. Run `openqed extract` first.'));
    return;
  }

  const maxCount = Math.max(...rows.map((r) => r.count));
  const barWidth = 30;

  console.log(chalk.bold('Nugget coverage by file:\n'));

  for (const row of rows) {
    const bar = '█'.repeat(Math.ceil((row.count / maxCount) * barWidth));
    const path = row.path.length > 40
      ? '...' + row.path.slice(-37)
      : row.path;
    console.log(`  ${path.padEnd(42)} ${chalk.cyan(bar)} ${row.count}`);
  }

  console.log(`\n${rows.length} file(s) with context nuggets.`);
}

export function createCoverageCommand(): Command {
  return new Command('coverage')
    .description('Show nugget coverage across files')
    .option('--gaps', 'show files with high queries but few nuggets')
    .action(runCoverage);
}
