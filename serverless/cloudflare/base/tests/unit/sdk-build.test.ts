// The SDK's build in dist/. assemble copies the allow-listed scripts and the frame document under
// api/sdk/, a prefix the Worker answers first on every plan (`/api/*`) and no frontend can hold, so
// no file of it is ever served raw. The frame document is stored without its `.html` name: the
// platform would redirect that name, and the frame has one address, the Worker's.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { AssembleError, assemble } from '../../scripts/lib/assemble.mjs'

const HASH = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const page = (title: string) =>
  `<!doctype html><html><head><meta http-equiv="content-security-policy" content="script-src 'self' ${HASH}; style-src 'self';"><title>${title}</title></head><body></body></html>`
const FRAME = '<!doctype html><title>frame</title><script src="/api/sdk/dist/v1/frame.js"></script>'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})

function write(root: string, base: string, files: Record<string, string>) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, base, name)), { recursive: true })
    writeFileSync(path.join(root, base, name), text)
  }
}

// The SDK's own build as its package writes it, with files assemble must leave out.
const BUILD = {
  'v1/loader.js': '(()=>{})()',
  'v1/frame.js': 'console.log("frame")',
  'v1/frame.css': 'body{margin:0}',
  'v1/frame.html': FRAME,
  'v1/loader.js.map': '{}',
  'v1/frame.css.map': '{}',
  'v1/notes.txt': 'not a script',
  'v1/.hidden.js': 'x',
  'v1/sub/deep.js': 'x',
  'v2/loader.js': 'two',
  'loose.js': 'x',
  'vx/loader.js': 'x',
}

function project(options: { sdk?: Record<string, string> | null } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'sdk-build-'))
  roots.push(root)
  write(root, 'static', {
    _headers: '# base\n/*\n  X-Content-Type-Options: nosniff\n',
    _redirects: '# none\n',
  })
  write(root, 'out', { 'index.html': page('Home'), '_astro/app.js': 'console.log(1)' })
  const sdk = options.sdk === undefined ? BUILD : options.sdk
  if (sdk !== null) write(root, 'sdk', sdk)
  const warnings: string[] = []
  return {
    root,
    write: (base: string, files: Record<string, string>) => write(root, base, files),
    warnings,
    options: {
      statics: path.join(root, 'static'),
      dist: path.join(root, 'dist'),
      frontend: path.join(root, 'out'),
      sdk: path.join(root, 'sdk'),
      warn: (message: string) => warnings.push(message),
    },
    read: (name: string) => readFileSync(path.join(root, 'dist', name), 'utf8'),
    has: (name: string) => existsSync(path.join(root, 'dist', name)),
  }
}

const listing = (dir: string, prefix = ''): string[] =>
  readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    return entry.isDirectory() ? listing(dir, relative) : [relative]
  })

describe('assemble with an SDK build', () => {
  it('copies the scripts under api/sdk/dist/ and the frame document to api/sdk/frame/v<major>', () => {
    const p = project()

    assemble(p.options)

    expect(p.read('api/sdk/dist/v1/loader.js')).toBe('(()=>{})()')
    expect(p.read('api/sdk/dist/v1/frame.js')).toBe('console.log("frame")')
    expect(p.read('api/sdk/dist/v1/frame.css')).toBe('body{margin:0}')
    expect(p.read('api/sdk/dist/v2/loader.js')).toBe('two')
    expect(p.read('api/sdk/frame/v1')).toBe(FRAME)
  })

  it('leaves out every file the Worker would not serve', () => {
    const p = project()

    assemble(p.options)

    const sdkFiles = listing(path.join(p.root, 'dist', 'api'))
    expect(sdkFiles.sort()).toEqual([
      'sdk/dist/v1/frame.css',
      'sdk/dist/v1/frame.js',
      'sdk/dist/v1/loader.js',
      'sdk/dist/v2/loader.js',
      'sdk/frame/v1',
    ])
  })

  it('puts nothing of the SDK outside api/sdk/, and no .html file inside it', () => {
    const p = project()
    const without = project({ sdk: null })
    assemble(p.options)
    assemble({ ...without.options, sdk: null })

    const added = listing(path.join(p.root, 'dist')).filter(
      (file) => !listing(path.join(without.root, 'dist')).includes(file),
    )

    expect(added.length).toBeGreaterThan(0)
    expect(added.every((file) => file.startsWith('api/sdk/') && !file.endsWith('.html'))).toBe(true)
  })

  it('leaves _headers and _redirects as they are without an SDK and checks no page of it', () => {
    const p = project()
    const without = project({ sdk: null })

    const summary = assemble(p.options)
    assemble({ ...without.options, sdk: null })

    expect(p.read('_headers')).toBe(without.read('_headers'))
    expect(p.read('_redirects')).toBe(without.read('_redirects'))
    expect(summary).toMatchObject({ pages: 1, withPolicy: 1, without: [] })
    expect(p.warnings).toEqual([])
  })

  it('fails when the SDK build is missing or empty, as a missing frontend build does', () => {
    const p = project({ sdk: null })
    const empty = project({ sdk: {} })
    const missing = { ...p.options, sdk: path.join(p.root, 'nothing-built') }

    expect(() => assemble(missing)).toThrow(AssembleError)
    expect(() => assemble(missing)).toThrow(/the SDK's build .* is missing or empty: build the SDK first/)
    expect(() => assemble(empty.options)).toThrow(/is missing or empty: build the SDK first/)
    expect(p.has('index.html')).toBe(false)
  })

  it('fails when the SDK build holds no major folder', () => {
    const p = project({ sdk: { 'loader.js': 'x' } })

    expect(() => assemble(p.options)).toThrow(/holds no v<major> folder/)
  })

  it('warns and builds without the SDK when its build is missing or empty and allowMissingSdk', () => {
    const p = project({ sdk: null })
    const empty = project({ sdk: {} })

    assemble({ ...p.options, sdk: path.join(p.root, 'nothing-built'), allowMissingSdk: true })
    assemble({ ...empty.options, allowMissingSdk: true })

    expect(p.has('api')).toBe(false)
    expect(empty.has('api')).toBe(false)
    expect(p.warnings.join(' ')).toMatch(/SDK's build .* is missing or empty/)
    expect(empty.warnings.join(' ')).toMatch(/SDK's build .* is missing or empty/)
  })

  it('serves nothing of an SDK build that holds no major folder', () => {
    const p = project({ sdk: { 'loader.js': 'x', 'notes.txt': 'y' } })

    assemble({ ...p.options, allowMissingSdk: true })

    expect(p.has('api')).toBe(false)
    expect(p.warnings.join(' ')).toMatch(/no v<major> folder/)
  })

  it('replaces a previous dist, so a file of an old build is not served', () => {
    const p = project()
    p.write('dist', { 'api/sdk/dist/v9/old.js': 'old' })

    assemble(p.options)

    expect(p.has('api/sdk/dist/v9/old.js')).toBe(false)
  })

  it('refuses a frontend output or a static file that already holds api/sdk', () => {
    const fromFrontend = project()
    fromFrontend.write('out', { 'api/sdk/x.json': '{}' })
    const fromStatic = project()
    fromStatic.write('static', { 'api/sdk/y.json': '{}' })

    expect(() => assemble(fromFrontend.options)).toThrow(AssembleError)
    expect(() => assemble(fromFrontend.options)).toThrow(/api\/sdk/)
    expect(() => assemble(fromStatic.options)).toThrow(/api\/sdk/)
    expect(fromFrontend.has('index.html')).toBe(false)
  })

  it('refuses a symbolic link in the SDK build (not checked where the platform cannot create one)', () => {
    const p = project()
    const outside = path.join(p.root, 'outside.js')
    writeFileSync(outside, 'CANARY')
    try {
      symlinkSync(outside, path.join(p.root, 'sdk', 'v1', 'link.js'))
    } catch {
      try {
        symlinkSync(path.join(p.root, 'out'), path.join(p.root, 'sdk', 'v1', 'linked'), 'junction')
      } catch {
        return
      }
    }

    expect(() => assemble(p.options)).toThrow(AssembleError)
    expect(() => assemble(p.options)).toThrow(/symbolic link/)
  })

  it('does not touch dist when the SDK build is refused', () => {
    const p = project()
    p.write('dist', { 'keep.txt': 'previous' })
    p.write('out', { 'api/sdk/x.json': '{}' })

    expect(() => assemble(p.options)).toThrow(AssembleError)

    expect(p.read('keep.txt')).toBe('previous')
  })
})

describe('assemble with an SDK build beside several frontends', () => {
  function several(dirs: string[]) {
    const p = project()
    for (const dir of dirs) p.write(`out-${dir}`, { 'index.html': page(dir) })
    return {
      ...p,
      options: {
        statics: p.options.statics,
        dist: p.options.dist,
        sdk: p.options.sdk,
        warn: p.options.warn,
        frontends: dirs.map((dir) => ({ dir, build: path.join(p.root, `out-${dir}`) })),
      },
    }
  }

  it('puts the SDK under api/sdk/ beside the frontends’ folders', () => {
    const p = several(['site', 'admin'])

    assemble(p.options)

    expect(p.read('api/sdk/frame/v1')).toBe(FRAME)
    expect(p.read('api/sdk/dist/v1/loader.js')).toBe('(()=>{})()')
    expect(p.has('site/index.html')).toBe(true)
    expect(p.read('_headers')).not.toContain('api/sdk')
  })

  it('refuses a frontend named api: its folder would hold the SDK files and serve them raw', () => {
    const p = several(['site', 'api'])

    expect(() => assemble(p.options)).toThrow(AssembleError)
    expect(() => assemble(p.options)).toThrow(/frontend directory "api"/)
  })

  it('does not refuse a frontend named api when the plan holds no SDK build', () => {
    const p = several(['site', 'api'])

    expect(() => assemble({ ...p.options, sdk: null })).not.toThrow()
  })
})

describe('scripts/assemble.mjs and SDK_DIR', () => {
  it('builds the SDK from the directory SDK_DIR names, relative to the package, over the default', () => {
    const p = project({ sdk: null })
    p.write('other-build', { 'v7/loader.js': 'seven', 'v7/frame.html': FRAME })
    const script = path.resolve(import.meta.dirname, '../../scripts/assemble.mjs')
    const root = path.resolve(import.meta.dirname, '../..')
    const out = path.join(p.root, 'dist-from-script')
    const sdk = path.relative(root, path.join(p.root, 'other-build'))

    execFileSync(process.execPath, [script, '--out', out, ...frontendArguments(p.root)], {
      env: { ...process.env, SDK_DIR: sdk },
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    expect(readFileSync(path.join(out, 'api/sdk/dist/v7/loader.js'), 'utf8')).toBe('seven')
    expect(readFileSync(path.join(out, 'api/sdk/frame/v7'), 'utf8')).toBe(FRAME)
  })

  it('fails for a missing default build unless --allow-missing-sdk, and blank SDK_DIR is unset', () => {
    const p = project({ sdk: null })
    const script = path.resolve(import.meta.dirname, '../../scripts/assemble.mjs')
    const out = path.join(p.root, 'dist-from-script')

    const run = (extra: string[]) =>
      execFileSync(process.execPath, [script, '--out', out, ...frontendArguments(p.root), ...extra], {
        env: { ...process.env, SDK_DIR: '  ' },
        stdio: ['ignore', 'ignore', 'pipe'],
      })

    expect(() => run([])).toThrow(/build the SDK first/)
    run(['--allow-missing-sdk'])

    expect(existsSync(path.join(out, '_headers'))).toBe(true)
  })
})

// The frontend output option, as this package takes it: one `--frontend <output dir>`, or a
// `<dir>=<output dir>` pair for each of several frontends.
function frontendArguments(base: string): string[] {
  // @nofrontends-start
  return ['--frontend', path.join(base, 'out')]
  // @nofrontends-end
  // @frontends-start
  const dirs = (JSON.parse('__FRONTENDS__') as { dir: string }[]).map((frontend) => frontend.dir)
  return dirs.flatMap((dir) => ['--frontend', `${dir}=${path.join(base, 'out')}`])
  // @frontends-end
}
