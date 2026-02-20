import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  external: ['better-sqlite3'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  clean: true,
  dts: true,
  splitting: false,
});
