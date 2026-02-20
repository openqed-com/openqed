import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig, writeDefaultConfig } from '../../src/export/config.js';

describe('export config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oqed-cfg-'));
    fs.mkdirSync(path.join(tmpDir, '.openqed'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when config file does not exist', () => {
    const config = loadConfig(tmpDir);
    expect(config.version).toBe(1);
    expect(config.export.nuggets).toBe(true);
    expect(config.export.sessions).toBe(true);
    expect(config.export.decisions).toBe(true);
    expect(config.export.artifacts).toBe(true);
    expect(config.export.events).toBe(false);
  });

  it('parses valid YAML config', () => {
    const configPath = path.join(tmpDir, '.openqed', 'config.yml');
    fs.writeFileSync(configPath, `version: 1\nexport:\n  nuggets: false\n  sessions: true\n  decisions: true\n  artifacts: false\n  events: true\n`);

    const config = loadConfig(tmpDir);
    expect(config.export.nuggets).toBe(false);
    expect(config.export.artifacts).toBe(false);
    expect(config.export.events).toBe(true);
  });

  it('fills in defaults for missing export fields', () => {
    const configPath = path.join(tmpDir, '.openqed', 'config.yml');
    fs.writeFileSync(configPath, `version: 1\n`);

    const config = loadConfig(tmpDir);
    expect(config.export.nuggets).toBe(true);
    expect(config.export.events).toBe(false);
  });

  it('rejects invalid version', () => {
    const configPath = path.join(tmpDir, '.openqed', 'config.yml');
    fs.writeFileSync(configPath, `version: 99\nexport:\n  nuggets: true\n`);

    expect(() => loadConfig(tmpDir)).toThrow();
  });

  it('writes default config', () => {
    writeDefaultConfig(tmpDir);
    const configPath = path.join(tmpDir, '.openqed', 'config.yml');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = loadConfig(tmpDir);
    expect(config.version).toBe(1);
    expect(config.export.nuggets).toBe(true);
    expect(config.export.events).toBe(false);
  });
});
