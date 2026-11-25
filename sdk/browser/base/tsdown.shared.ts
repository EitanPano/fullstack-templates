import type { UserConfig } from 'tsdown'

import pkg from './package.json' with { type: 'json' }

export const major = Number(pkg.version.split('.')[0])

// Replaced at build time. The npm build takes its default API origin from SDK_API_ORIGIN (empty
// when unset: `init` then needs `apiOrigin`); the CDN loader takes it from its own script tag.
export const define = (apiOrigin: string) => ({
  __SDK_VERSION__: JSON.stringify(pkg.version),
  __SDK_API_ORIGIN__: JSON.stringify(apiOrigin),
})

// The frame document: no inline script or style (its policy allows neither), no margin (the
// script sets it through the CSSOM), and its script from the same origin, at the major's address.
export const frameHtml = (): string =>
  [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Frame</title>',
    '</head>',
    '<body>',
    `<script src="/api/sdk/dist/v${major}/frame.js"></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')

const iife = {
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  dts: false,
  clean: false,
  sourcemap: false,
  outputOptions: { entryFileNames: '[name].js' },
} satisfies UserConfig

/** The CDN outputs under `<outDir>/v<major>/`: loader.js, frame.js and frame.html. */
export function cdnConfigs(options: {
  loader: string
  frame: string
  outDir: string
}): UserConfig[] {
  const outDir = `${options.outDir}/v${major}`
  return [
    {
      ...iife,
      entry: { loader: options.loader },
      outDir,
      define: define(''),
    },
    {
      ...iife,
      entry: { frame: options.frame },
      outDir,
      define: define(''),
      plugins: [
        {
          name: 'frame-html',
          generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'frame.html', source: frameHtml() })
          },
        },
      ],
    },
  ]
}
