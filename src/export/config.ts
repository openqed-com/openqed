import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { OPENQED_CONFIG_FILE } from '../utils/paths.js';

const ExportConfigSchema = z.object({
  nuggets: z.boolean().default(true),
  sessions: z.boolean().default(true),
  decisions: z.boolean().default(true),
  artifacts: z.boolean().default(true),
  events: z.boolean().default(false),
});

const ConfigSchema = z.object({
  version: z.literal(1),
  export: ExportConfigSchema.default({
    nuggets: true,
    sessions: true,
    decisions: true,
    artifacts: true,
    events: false,
  }),
});

export type ExportConfig = z.infer<typeof ExportConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

const DEFAULT_CONFIG: Config = {
  version: 1,
  export: {
    nuggets: true,
    sessions: true,
    decisions: true,
    artifacts: true,
    events: false,
  },
};

export function loadConfig(workspacePath: string): Config {
  const configPath = path.join(workspacePath, OPENQED_CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = YAML.parse(raw);
  return ConfigSchema.parse(parsed);
}

export function writeDefaultConfig(workspacePath: string): void {
  const configPath = path.join(workspacePath, OPENQED_CONFIG_FILE);
  const yamlStr = YAML.stringify(DEFAULT_CONFIG, { indent: 2 });
  fs.writeFileSync(configPath, yamlStr, 'utf-8');
}
