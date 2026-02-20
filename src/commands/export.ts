import { Command } from 'commander';
import chalk from 'chalk';
import { detectWorkspace } from '../workspace/detect.js';
import { getStore } from '../store/index.js';
import { upsertWorkspace } from '../store/store.js';
import { loadConfig } from '../export/config.js';
import { exportWorkspace } from '../export/exporter.js';
import type { ExportConfig } from '../export/config.js';

async function runExport(options: {
  types?: string;
  all?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  const workspace = await detectWorkspace(process.cwd());
  const db = getStore();
  upsertWorkspace(db, workspace);

  const config = loadConfig(workspace.path);
  let exportConfig: ExportConfig = config.export;

  if (options.types) {
    const selected = options.types.split(',').map((t) => t.trim());
    exportConfig = {
      nuggets: selected.includes('nuggets'),
      sessions: selected.includes('sessions'),
      decisions: selected.includes('decisions'),
      artifacts: selected.includes('artifacts'),
      events: selected.includes('events'),
    };
  } else if (options.all) {
    exportConfig = {
      nuggets: true,
      sessions: true,
      decisions: true,
      artifacts: true,
      events: true,
    };
  }

  if (options.dryRun) {
    console.log(chalk.yellow('Dry run — no files will be written.'));
    console.log('Would export:', Object.entries(exportConfig)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', '));
    return;
  }

  const summary = exportWorkspace(db, workspace.id, workspace.path, exportConfig);

  console.log(chalk.green('Export complete:'));
  if (exportConfig.sessions) console.log(`  sessions:  ${summary.sessions}`);
  if (exportConfig.nuggets) console.log(`  nuggets:   ${summary.nuggets}`);
  if (exportConfig.decisions) console.log(`  decisions: ${summary.decisions}`);
  if (exportConfig.artifacts) console.log(`  artifacts: ${summary.artifacts}`);
  if (exportConfig.events) console.log(`  events:    ${summary.events}`);
}

export function createExportCommand(): Command {
  return new Command('export')
    .description('Export provenance data to .openqed/data/ as JSONL files')
    .option('--types <types>', 'Comma-separated list of types to export (nuggets,sessions,decisions,artifacts,events)')
    .option('--all', 'Export all types including events')
    .option('--dry-run', 'Show what would be exported without writing files')
    .action(runExport);
}
