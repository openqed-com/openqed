import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { getStore } from '../store/index.js';
import { upsertWorkspace } from '../store/store.js';
import { loadConfig } from '../export/config.js';
import { importWorkspace } from '../export/importer.js';
import { OPENQED_DATA_SUBDIR } from '../utils/paths.js';
import type { ExportConfig } from '../export/config.js';

async function runImport(options: {
  types?: string;
  dryRun?: boolean;
}): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const dataDir = path.join(workspace.path, OPENQED_DATA_SUBDIR);

  if (!fs.existsSync(dataDir)) {
    console.error(
      chalk.red(`Error: No exported data found at ${dataDir}`),
    );
    console.error('Run ' + chalk.cyan('openqed export') + ' first, or check that .openqed/data/ exists.');
    process.exitCode = 1;
    return;
  }

  const db = getStore();
  upsertWorkspace(db, workspace);

  const config = loadConfig(workspace.path);
  let importConfig: ExportConfig = config.export;

  if (options.types) {
    const selected = options.types.split(',').map((t) => t.trim());
    importConfig = {
      nuggets: selected.includes('nuggets'),
      sessions: selected.includes('sessions'),
      decisions: selected.includes('decisions'),
      artifacts: selected.includes('artifacts'),
      events: false, // Events are not imported
    };
  }

  if (options.dryRun) {
    console.log(chalk.yellow('Dry run — no records will be inserted.'));
    const types = Object.entries(importConfig)
      .filter(([, v]) => v)
      .map(([k]) => k);
    for (const t of types) {
      const filePath = path.join(dataDir, `${t}.jsonl`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8').trim();
        const lineCount = content === '' ? 0 : content.split('\n').length;
        console.log(`  ${t}: ${lineCount} records`);
      } else {
        console.log(`  ${t}: no file found`);
      }
    }
    return;
  }

  const summary = importWorkspace(db, workspace.path, importConfig);

  console.log(chalk.green('Import complete:'));
  for (const [type, counts] of Object.entries(summary)) {
    const { inserted, skipped, errored } = counts as { inserted: number; skipped: number; errored: number };
    const parts = [`${inserted} inserted`];
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (errored > 0) parts.push(chalk.red(`${errored} errored`));
    console.log(`  ${type}: ${parts.join(', ')}`);
  }
}

export function createImportCommand(): Command {
  return new Command('import')
    .description('Import provenance data from .openqed/data/ JSONL files into the local store')
    .option('--types <types>', 'Comma-separated list of types to import (nuggets,sessions,decisions,artifacts)')
    .option('--dry-run', 'Show what would be imported without inserting records')
    .action(runImport);
}
