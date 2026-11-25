import { describe, expect, setDefaultTimeout, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { loadCatalog } from '../lib/catalog'
import { CATALOG_ROOT } from '../lib/cli'
import { listFiles, removeTree } from '../lib/files'
import { generate } from '../lib/generate'
import { isTextFile } from '../lib/placeholders'
import { resolveRequest } from '../lib/plan'
import { tempDir } from './helpers'

// Each test generates a project from the real templates; a cold or loaded machine is slow.
setDefaultTimeout(60_000)

// The no-SDK guarantee (ADR 0020 K3): a project without an sdk package holds no trace of the
// namespace, and the same stack with one does, so a wrong search cannot pass the first half.
const catalog = loadCatalog(CATALOG_ROOT)
const TRACES = ['sdk_keys', 'sdk_dir', 'sdk_enabled', 'x-sdk-key', '/api/sdk', '__sdk_']

function generated(stack: string, withSdk: boolean): { out: string; files: string[] } {
  const out = tempDir()
  const plan = resolveRequest(catalog, {
    out,
    name: 'Demo',
    stack,
    flags: [],
    capabilities: [],
    skipPostGenerate: true,
    ...(withSdk ? { sdks: [{ dir: 'sdk-example', template: 'sdk/browser' }] } : {}),
  })
  generate(catalog, plan)
  return { out, files: listFiles(out).map((f) => path.relative(out, f).split(path.sep).join('/')) }
}

// A segment named `sdk` or `sdk-<name>`; the frontends' generated client file `sdk.gen.ts` is
// the OpenAPI tool's own name and no trace of this package.
const sdkPaths = (files: string[]) =>
  files.filter(
    (f) => f.includes('api/sdk') || f.split('/').some((s) => s === 'sdk' || s.startsWith('sdk-')),
  )

function traces(out: string, files: string[]): string[] {
  const found: string[] = []
  for (const file of files) {
    if (!isTextFile(file)) continue
    const text = readFileSync(path.join(out, file), 'utf8').toLowerCase()
    for (const trace of TRACES) if (text.includes(trace)) found.push(`${file}: ${trace}`)
  }
  return found
}

describe.each(['react-bun-express', 'react-python-fastapi', 'astro-cloudflare'])(
  'the no-sdk guarantee of %s',
  (stack) => {
    test('a project without an sdk holds no path or text of it', () => {
      const { out, files } = generated(stack, false)
      try {
        expect(sdkPaths(files)).toEqual([])
        expect(traces(out, files)).toEqual([])
      } finally {
        removeTree(out)
      }
    })

    test('the same stack with an sdk holds them, so the search can find them', () => {
      const { out, files } = generated(stack, true)
      try {
        expect(files.some((f) => f.includes('api/sdk'))).toBe(true)
        const found = traces(out, files)
        // The API package's own environment example names the key variable.
        expect(found.some((line) => line.includes('example') && line.includes('sdk_keys'))).toBe(
          true,
        )
      } finally {
        removeTree(out)
      }
    })
  },
)
