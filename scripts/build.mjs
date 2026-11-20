import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mcpRoot = path.resolve(here, '..');

await esbuild.build({
  entryPoints: [path.join(mcpRoot, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(mcpRoot, 'dist/index.js'),
  banner: { js: '#!/usr/bin/env node' },
  external: ['@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk/*', 'ws', 'zod'],
});

console.error('Built mcp/dist/index.js');
