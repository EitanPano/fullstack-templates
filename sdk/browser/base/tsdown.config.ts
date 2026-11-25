import { defineConfig } from 'tsdown'

import { cdnConfigs, define } from './tsdown.shared.ts'

// One config, three outputs from one source (ADR 0020 T2.1): the npm entry (ESM, CJS, both
// declaration files), the CDN loader (one IIFE) and the frame (script and document).
// `scripts/clean.mjs` empties dist/ first, so the configs never clean each other's files.
export default defineConfig([
  {
    entry: { index: 'src/entries/index.ts' },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2020',
    dts: true,
    clean: false,
    sourcemap: false,
    outDir: 'dist',
    define: define(process.env.SDK_API_ORIGIN ?? ''),
  },
  ...cdnConfigs({
    loader: 'src/entries/cdn.ts',
    frame: 'src/entries/frame.ts',
    outDir: 'dist/cdn',
  }),
])
