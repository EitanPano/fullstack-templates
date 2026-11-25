import { readFileSync, globSync } from 'node:fs'
import { join } from 'node:path'

import type { UserConfig } from 'tsdown'

import pkg from './package.json' with { type: 'json' }

export const major = Number(pkg.version.split('.')[0])

// Replaced at build time. The npm build takes its default API origin from SDK_API_ORIGIN (empty
// when unset: `init` then needs `apiOrigin`); the CDN loader takes it from its own script tag.
export const define = (apiOrigin: string) => ({
  __SDK_VERSION__: JSON.stringify(pkg.version),
  __SDK_API_ORIGIN__: JSON.stringify(apiOrigin),
})

// The frame document: no inline script or style (its policy allows neither), and its stylesheet
// and script from the same origin, at the major's address.
export const frameHtml = (): string =>
  [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Frame</title>',
    `<link rel="stylesheet" href="/api/sdk/dist/v${major}/frame.css">`,
    '</head>',
    '<body>',
    `<script src="/api/sdk/dist/v${major}/frame.js"></script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')

// The module sheets of the real build: `src/modules/<name>/frame.css`, or files under that
// module's `frame/` folder. Each rule in them is scoped under `[data-module='<name>']`.
export const MODULE_SHEETS = ['src/modules/*/frame.css', 'src/modules/*/frame/**/*.css']

// Every module's sheet goes into the one frame.css, so a rule outside the module's own scope would
// restyle the other modules' frames, and a font or an address would be a request the frame's
// policy does not allow. `kind` is what a `{` opens: a group whose rules are checked (a top level
// or @media, @supports, @container), keyframes (steps are not selectors) or a style rule (what is
// nested in it is scoped by it).
type Block = 'group' | 'keyframes' | 'style'

/**
 * Fails, naming the file and the line, when a module's sheet holds `@import`, `@font-face` or
 * `url(`, or a rule whose selector does not start with `[data-module='<name>']`. A small scanner:
 * comments are blanked (lines kept), strings are skipped, braces are counted.
 */
export function checkModuleSheet(css: string, name: string, file: string): void {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
  const lineAt = (index: number) => text.slice(0, index).split('\n').length
  const fail = (index: number, why: string): never => {
    throw new Error(`${file}:${lineAt(index)}: ${why}`)
  }
  for (const [pattern, why] of [
    [/@import\b/i, '@import is not allowed in a module sheet'],
    [/@font-face\b/i, '@font-face is not allowed in a module sheet'],
    [/url\(/i, 'url( is not allowed in a module sheet: an image goes through createImage'],
  ] as const) {
    const found = pattern.exec(text)
    if (found) fail(found.index, why)
  }

  const scopes = [`[data-module='${name}']`, `[data-module="${name}"]`]
  const stack: Block[] = ['group']
  let start = 0
  let depth = 0
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"' || char === "'") {
      index = skipString(text, index)
    } else if (char === '(' || char === '[') {
      depth += 1
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1)
    } else if (char === ';' && depth === 0) {
      start = index + 1
    } else if (char === '}') {
      if (stack.length > 1) stack.pop()
      start = index + 1
    } else if (char === '{' && depth === 0) {
      const prelude = text.slice(start, index)
      const at = start + prelude.length - prelude.trimStart().length
      const kind = stack[stack.length - 1]
      const header = prelude.trim()
      if (header.startsWith('@')) {
        stack.push(/^@(-\w+-)?keyframes\b/i.test(header) ? 'keyframes' : 'group')
      } else {
        if (kind === 'group') {
          for (const selector of splitSelectors(header)) {
            if (!scopes.some((scope) => selector.startsWith(scope))) {
              fail(at, `selector "${selector}" is not scoped under ${scopes[0]}`)
            }
          }
        }
        stack.push(kind === 'keyframes' ? 'keyframes' : 'style')
      }
      start = index + 1
    }
  }
}

// The index of the closing quote of the string that opens at `from`.
function skipString(text: string, from: number): number {
  for (let index = from + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1
    else if (text[index] === text[from]) return index
  }
  return text.length
}

// A selector list split at its top-level commas: `:is(a, b)` and `[title='a,b']` stay whole.
function splitSelectors(header: string): string[] {
  const parts: string[] = []
  let depth = 0
  let from = 0
  for (let index = 0; index < header.length; index += 1) {
    const char = header[index]
    if (char === '"' || char === "'") index = skipString(header, index)
    else if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(header.slice(from, index).trim())
      from = index + 1
    }
  }
  parts.push(header.slice(from).trim())
  return parts
}

/**
 * The frame's one stylesheet: the base, then each module sheet in path order. A sheet under
 * `src/modules/<name>/` is checked against its module's scope (`checkModuleSheet`); the base is
 * not. No dependency joins the files, so the bundler writes no CSS asset of its own.
 */
export function joinStyles(
  root: string,
  sheets: readonly string[],
): { css: string; files: string[] } {
  const base = join(root, 'src/frame/base.css')
  const modules = sheets
    .flatMap((pattern) => globSync(pattern, { cwd: root }))
    .map((file) => file.replaceAll('\\', '/'))
  const relative = [...new Set(modules)].sort()
  const files = [base, ...relative.map((file) => join(root, file))]
  const parts = files.map((file) => readFileSync(file, 'utf8'))
  relative.forEach((file, index) => {
    const owner = /^src\/modules\/([^/]+)\//.exec(file)?.[1]
    if (owner) checkModuleSheet(parts[index + 1] as string, owner, file)
  })
  return { css: parts.join('\n'), files }
}

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

/** The CDN outputs under `<outDir>/v<major>/`: loader.js, frame.js, frame.css and frame.html. */
export function cdnConfigs(options: {
  loader: string
  frame: string
  outDir: string
  /** Globs of the module sheets the frame.css holds after the base. */
  moduleSheets: readonly string[]
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
          name: 'frame-document',
          // A change to any sheet rebuilds the frame in `dev`.
          buildStart() {
            for (const file of joinStyles(process.cwd(), options.moduleSheets).files) {
              this.addWatchFile(file)
            }
          },
          generateBundle() {
            this.emitFile({ type: 'asset', fileName: 'frame.html', source: frameHtml() })
            const { css } = joinStyles(process.cwd(), options.moduleSheets)
            this.emitFile({ type: 'asset', fileName: 'frame.css', source: css })
          },
        },
      ],
    },
  ]
}
