import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'mcp-server': 'src/mcp-server.ts' },
  format: ['esm'],
  target: 'node20',
  external: ['better-sqlite3', '@modelcontextprotocol/sdk', 'zod'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  clean: true,
  dts: true,
  splitting: false,
});
