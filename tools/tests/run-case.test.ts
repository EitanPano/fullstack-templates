import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { listCases } from '../lib/cases'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runCase, type Capture, type Options, type Probe, type ProbeResult } from '../lib/run-case'
import { FIXTURE, copyFixture, tempDir } from './helpers'

const catalog = loadCatalog(FIXTURE)
const find = (id: string) => {
  const found = listCases(catalog).find((c) => c.id === id)
  if (!found) throw new Error(`no case ${id}`)
  return found
}
const OFF: Options = {
  e2e: false,
  installBrowsers: false,
  keep: false,
  withServices: false,
  withApp: false,
}
const ON: Options = { ...OFF, withServices: true }

function recorder(failOn?: string) {
  const calls: { line: string; cwd: string }[] = []
  const runner = (line: string, cwd: string) => {
    calls.push({ line, cwd })
    if (failOn !== undefined && line === failOn) throw new Error(`boom ${line}`)
  }
  return { calls, runner }
}
const lines = () => {
  const out: string[] = []
  return { out, log: (message: string) => out.push(message) }
}

describe('runCase with services', () => {
  test('starts the provider, migrates, checks, tests the database, then tears down', async () => {
    const { calls, runner } = recorder()
    await runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, lines().log)
    const up = calls[0]?.line ?? ''
    const project = up.match(/^docker compose -p (\S+) up -d --wait database$/)?.[1]
    expect(project).toMatch(/^[a-z0-9][a-z0-9_-]*$/)
    expect(calls.map((c) => c.line.replace(project as string, '<p>'))).toEqual([
      'docker compose -p <p> up -d --wait database',
      'bun run db:migrate',
      'bun ./ok.ts',
      'bun run test:db',
      'docker compose -p <p> down -v --remove-orphans',
    ])
    expect(calls[0]?.cwd).toBe(calls[4]?.cwd as string)
  })
  test('project names differ between runs', async () => {
    const a = recorder()
    const b = recorder()
    await runCase(catalog, find('server/mini/fake'), tempDir(), ON, a.runner, lines().log)
    await runCase(catalog, find('server/mini/fake'), tempDir(), ON, b.runner, lines().log)
    expect(a.calls[0]?.line).not.toBe(b.calls[0]?.line)
  })
  test('tears down when a step fails and throws the original error', async () => {
    const { calls, runner } = recorder('bun ./ok.ts')
    await expect(
      runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, lines().log),
    ).rejects.toThrow('boom bun ./ok.ts')
    expect(calls.at(-1)?.line).toMatch(/ down -v --remove-orphans$/)
    expect(calls.some((c) => c.line === 'bun run test:db')).toBe(false)
  })
  test('a teardown failure fails the case without hiding the original error', async () => {
    const calls: string[] = []
    const runner = (line: string) => {
      calls.push(line)
      if (line === 'bun ./ok.ts') throw new Error('primary')
      if (line.includes(' down ')) throw new Error('teardown')
    }
    const { out, log } = lines()
    await expect(
      runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, log),
    ).rejects.toThrow('primary')
    expect(out.join('\n')).toContain('teardown')
  })
  test('a teardown failure alone fails the case', async () => {
    const runner = (line: string) => {
      if (line.includes(' down ')) throw new Error('teardown')
    }
    await expect(
      runCase(catalog, find('server/mini/fake'), tempDir(), ON, runner, lines().log),
    ).rejects.toThrow('teardown')
  })
})

describe('runCase without --with-services', () => {
  test('runs check only and prints the two SKIP lines', async () => {
    const { calls, runner } = recorder()
    const { out, log } = lines()
    await runCase(catalog, find('server/mini/fake'), tempDir(), OFF, runner, log)
    expect(calls.map((c) => c.line)).toEqual(['bun ./ok.ts'])
    expect(out).toEqual([
      'SKIP migrate backend: needs --with-services',
      'SKIP testDb backend: needs --with-services',
    ])
  })
})

describe('runCase without a capability', () => {
  test('runs exactly check, with or without --with-services', async () => {
    for (const options of [OFF, ON]) {
      const { calls, runner } = recorder()
      const { out, log } = lines()
      await runCase(catalog, find('server/mini/default'), tempDir(), options, runner, log)
      expect(calls.map((c) => c.line)).toEqual(['bun ./ok.ts'])
      expect(out).toEqual([])
    }
  })
})

// The fixture's fake case, marked as one that runs the app smoke.
function appCatalog(extra?: (root: string) => void) {
  const root = copyFixture('catalog')
  const file = path.join(root, 'server/mini/tests/cases.yaml')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'name: fake\n    capabilities:',
      'name: fake\n    withApp: true\n    capabilities:',
    ),
  )
  extra?.(root)
  const loaded = loadCatalog(root)
  const found = listCases(loaded).find((c) => c.id === 'server/mini/fake')
  if (!found?.withApp) throw new Error('fixture case lost withApp')
  return { loaded, c: found }
}
const APP: Options = { ...OFF, withApp: true }
const ok: Probe = async () => ({ status: 200, body: 'ok' })

type Call = { line: string; vars: NodeJS.ProcessEnv | undefined }
function recordWithVars(failOn?: (line: string, vars?: NodeJS.ProcessEnv) => boolean) {
  const calls: Call[] = []
  const runner = (line: string, _cwd: string, vars?: NodeJS.ProcessEnv) => {
    calls.push({ line, vars })
    if (failOn?.(line, vars)) throw new Error(`boom ${line}`)
  }
  return { calls, runner }
}
const docker = (calls: Call[]) => calls.filter((c) => c.line.startsWith('docker'))
const upVars = (calls: Call[]) => calls.find((x) => x.line.includes(' up '))?.vars ?? {}

describe('runCase app smoke', () => {
  test('builds with the app profile and the case project, probes, then tears down', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars()
    const urls: string[] = []
    const probe: Probe = async (url) => {
      urls.push(url)
      return { status: 200, body: '' }
    }
    await runCase(loaded, c, tempDir(), APP, runner, lines().log, probe)
    const smoke = docker(calls)
    expect(smoke).toHaveLength(2)
    expect(smoke[0]?.line).toMatch(
      /^docker compose -p fullstack-server-mini-fake-[0-9a-f]{6} --profile app up --build --wait$/,
    )
    const project = smoke[0]?.line.match(/-p (\S+)/)?.[1]
    expect(smoke[1]?.line).toBe(`docker compose -p ${project} --profile app down -v`)
    expect(urls).toEqual(['http://127.0.0.1:4000/api/health'])
  })
  test('probes health then ready when the server declares both', async () => {
    const { loaded, c } = appCatalog((root) => {
      const manifest = path.join(root, 'server/mini/template.yaml')
      writeFileSync(
        manifest,
        readFileSync(manifest, 'utf8').replace(
          'health: /api/health',
          'health: /api/health\n  ready: /api/ready',
        ),
      )
    })
    const urls: string[] = []
    const probe: Probe = async (url) => {
      urls.push(url)
      return { status: 200, body: '' }
    }
    await runCase(loaded, c, tempDir(), APP, recordWithVars().runner, lines().log, probe)
    expect(urls).toEqual(['http://127.0.0.1:4000/api/health', 'http://127.0.0.1:4000/api/ready'])
  })
  test('tears down when the probe keeps failing, and reports status and body', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars()
    const probe: Probe = async () => ({ status: 503, body: 'not ready' })
    // The clock jumps 20 s per reading and the wait never sleeps for real, so 60 s pass quickly.
    let clock = 0
    const realNow = Date.now
    const realSetTimeout = globalThis.setTimeout
    Date.now = () => (clock += 20_000)
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout
    try {
      await expect(runCase(loaded, c, tempDir(), APP, runner, lines().log, probe)).rejects.toThrow(
        'status 503, body not ready',
      )
    } finally {
      Date.now = realNow
      globalThis.setTimeout = realSetTimeout
    }
    expect(docker(calls).at(-1)?.line).toMatch(/--profile app down -v$/)
  })
  test('tears down when up throws and rethrows that error', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars((line) => line.includes(' up '))
    const probe: Probe = async () => {
      throw new Error('probe must not run')
    }
    await expect(runCase(loaded, c, tempDir(), APP, runner, lines().log, probe)).rejects.toThrow(
      'boom docker compose',
    )
    // A failed smoke prints the container states and logs before the teardown destroys them.
    const verbs = docker(calls).map((d) => d.line.split(' --profile app ')[1])
    expect(verbs).toEqual(['up --build --wait', 'ps -a', 'logs --no-color --tail 200', 'down -v'])
    const project = docker(calls)[0]?.line.match(/-p (\S+)/)?.[1]
    expect(docker(calls)[1]?.line).toBe(`docker compose -p ${project} --profile app ps -a`)
  })
  test('a failing diagnostic is swallowed: the original error and the teardown still happen', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars(
      (line) => line.includes(' up ') || line.includes(' ps ') || line.includes(' logs '),
    )
    await expect(runCase(loaded, c, tempDir(), APP, runner, lines().log, ok)).rejects.toThrow(
      'boom docker compose -p',
    )
    expect(docker(calls).at(-1)?.line).toMatch(/--profile app down -v$/)
    expect(docker(calls)).toHaveLength(4)
  })
  test('a passing smoke runs no diagnostics', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars()
    await runCase(loaded, c, tempDir(), APP, runner, lines().log, ok)
    expect(docker(calls).some((d) => / (ps|logs) /.test(d.line))).toBe(false)
  })
  test('the variables hold the provider value and random secrets, never placeholders', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars()
    await runCase(loaded, c, tempDir(), APP, runner, lines().log, ok)
    const vars = upVars(calls)
    expect(vars.DATABASE_URL).toBe('fake://database:5432/app')
    expect(Buffer.from(vars.SECRET as string, 'base64')).toHaveLength(32)
    expect(vars.SECRET).not.toMatch(/change|placeholder|example/i)
  })
  test('a variable named only in a comment gets no value', async () => {
    const { loaded, c } = appCatalog((root) => {
      const file = path.join(root, 'server/mini/compose.yaml')
      writeFileSync(file, `# example: \${NOTE} is not used\n${readFileSync(file, 'utf8')}`)
    })
    const { calls, runner } = recordWithVars()
    await runCase(loaded, c, tempDir(), APP, runner, lines().log, ok)
    expect(Object.keys(upVars(calls))).not.toContain('NOTE')
    expect(Object.keys(upVars(calls))).toContain('SECRET')
  })
  test('random values differ between runs', async () => {
    const { loaded, c } = appCatalog()
    const secrets: string[] = []
    for (let i = 0; i < 2; i++) {
      const { calls, runner } = recordWithVars()
      await runCase(loaded, c, tempDir(), APP, runner, lines().log, ok)
      secrets.push(upVars(calls).SECRET as string)
    }
    expect(secrets[0]).not.toBe(secrets[1])
  })
  test('no secret value reaches the log, only the names', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars()
    const { out, log } = lines()
    await runCase(loaded, c, tempDir(), APP, runner, log, ok)
    const text = out.join('\n')
    expect(text).toContain('SECRET')
    expect(text).toContain('DATABASE_URL')
    for (const value of Object.values(upVars(calls))) expect(text).not.toContain(String(value))
  })
  test('a case without withApp runs no Docker command for the smoke', async () => {
    const { loaded } = appCatalog()
    const other = listCases(loaded).find((x) => x.id === 'server/mini/default')
    if (other === undefined) throw new Error('missing case')
    const { calls, runner } = recordWithVars()
    const { out, log } = lines()
    await runCase(loaded, other, tempDir(), APP, runner, log, ok)
    expect(docker(calls)).toEqual([])
    expect(out).toEqual([])
  })
  test('without --with-app a withApp case logs the skip and runs no Docker command', async () => {
    const { loaded, c } = appCatalog()
    const { calls, runner } = recordWithVars()
    const { out, log } = lines()
    await runCase(loaded, c, tempDir(), OFF, runner, log, ok)
    expect(docker(calls)).toEqual([])
    expect(out).toContain('SKIP app smoke: needs --with-app')
  })
})

// The per-mode smoke: a stack of the fixture server (port 4000) and either a static frontend
// (mini-spa, port 5173) or one that is not an SPA (mini-ui).
const INDEX =
  '<html><body><div id="root"></div><script type="module" crossorigin src="/assets/index-AbC123.js"></script></body></html>'
const SPA_ROUTE = '/some/client/route'
const NOT_FOUND = JSON.stringify({
  error: { code: 'not_found', message: 'no route' },
  requestId: 'r1',
})
const PUBLIC_FILES =
  '/app/public\n/app/public/index.html\n/app/public/assets\n/app/public/assets/index-AbC123.js'
// Spelled in two parts so no tool that scans for secret file names trips on the test data.
const DOTFILE = '/app/public/.' + 'env.local'

function stackCatalog(options: {
  frontend: 'mini-spa' | 'mini-ui'
  deploy?: string
  e2e?: boolean
}) {
  const root = copyFixture('catalog')
  const stack = options.frontend === 'mini-spa' ? 'mini-spa' : 'mini'
  const cases = path.join(root, `frontend/${options.frontend}/tests/cases.yaml`)
  const extra = `    withApp: true\n${options.deploy ? `    deploy: ${options.deploy}\n` : ''}`
  writeFileSync(
    cases,
    readFileSync(cases, 'utf8').replace(`stack: ${stack}\n`, (m) => m + extra),
  )
  if (options.e2e) {
    const manifest = path.join(root, `frontend/${options.frontend}/template.yaml`)
    writeFileSync(
      manifest,
      readFileSync(manifest, 'utf8').replace(
        '  contract: bun ./ok.ts\n',
        '  contract: bun ./ok.ts\n  testE2e: bun ./ok.ts e2e\n',
      ),
    )
  }
  const loaded = loadCatalog(root)
  const found = listCases(loaded).find((c) => c.id === `frontend/${options.frontend}/default`)
  if (!found?.withApp) throw new Error('fixture case lost withApp')
  return { loaded, c: found }
}

type Reply = ProbeResult | Error
// A fake site keyed by URL; `overrides` replaces single answers. `at` is the public port.
function site(at: number, overrides: Record<string, Reply> = {}) {
  const html = (body: string): ProbeResult => ({
    status: 200,
    body,
    contentType: 'text/html; charset=utf-8',
  })
  const base = `http://127.0.0.1:${String(at)}`
  const table: Record<string, Reply> = {
    'http://127.0.0.1:4000/api/health': { status: 200, body: '{}' },
    [`${base}/api/health`]: { status: 200, body: '{}' },
    [`${base}/`]: html(INDEX),
    [`${base}${SPA_ROUTE}`]: html(INDEX),
    [`${base}/api/nope`]: { status: 404, body: NOT_FOUND, contentType: 'application/json' },
    ...overrides,
  }
  const urls: string[] = []
  const probe: Probe = async (url) => {
    urls.push(url)
    const found = table[url]
    if (found === undefined) throw new Error(`unexpected ${url}`)
    if (found instanceof Error) throw found
    return found
  }
  return { probe, urls }
}
// Captured commands are matched by a fragment of their line; the first match answers.
function fakeCapture(answers: Record<string, string> = {}) {
  const asked: string[] = []
  const defaults = {
    'docker compose version --short': '5.5.0',
    'exec -T backend find /app/public': PUBLIC_FILES,
    'exec -T frontend id -u': '101',
  }
  const table = [...Object.entries(answers), ...Object.entries(defaults)]
  const capture: Capture = (line) => {
    asked.push(line.replace(/-p \S+ /, ''))
    const hit = table.find(([needle]) => line.includes(needle))
    if (hit === undefined) throw new Error(`unexpected capture ${line}`)
    return hit[1]
  }
  return { capture, asked }
}
const verbs = (calls: Call[]) => docker(calls).map((d) => d.line.split(' --profile app ')[1])
const e2eCalls = (calls: Call[]) => calls.filter((x) => x.line === 'bun ./ok.ts e2e')
const againstApp = (calls: Call[]) => e2eCalls(calls).filter((x) => x.vars?.E2E_BASE_URL)
const E2E: Options = { ...APP, e2e: true }
function smoke(
  built: ReturnType<typeof stackCatalog>,
  options: Options,
  probe: Probe,
  capture: Capture,
  failOn?: (line: string, vars?: NodeJS.ProcessEnv) => boolean,
) {
  const rec = recordWithVars(failOn)
  const result = runCase(
    built.loaded,
    built.c,
    tempDir(),
    options,
    rec.runner,
    lines().log,
    probe,
    capture,
  )
  return { calls: rec.calls, result }
}

describe('case deploy', () => {
  test('a case with deploy split generates split and one without generates the default', async () => {
    for (const [deploy, expected] of [
      ['split', 'split'],
      [undefined, 'single'],
    ] as const) {
      const built = stackCatalog({ frontend: 'mini-spa', deploy })
      const out = tempDir()
      await runCase(built.loaded, built.c, out, OFF, recordWithVars().runner, lines().log)
      expect(readFileSync(path.join(out, '.fullstack/catalog.yaml'), 'utf8')).toMatch(
        new RegExp(`^deploy: ${expected}$`, 'm'),
      )
      const compose = readFileSync(path.join(out, 'docker-compose.yml'), 'utf8')
      expect(compose.includes('scale: 0')).toBe(expected === 'single')
    }
  })
})

describe('app smoke, single', () => {
  const build = (e2e = false) => stackCatalog({ frontend: 'mini-spa', e2e })
  const at4000 = (path: string, reply: Reply) => ({ [`http://127.0.0.1:4000${path}`]: reply })
  const htmlReply = (body: string, contentType = 'text/html'): ProbeResult => ({
    status: 200,
    body,
    contentType,
  })
  test('checks the floor, boots, probes the SPA and the 404 on the server port, inspects public/', async () => {
    const { probe, urls } = site(4000)
    const { capture, asked } = fakeCapture()
    const { calls, result } = smoke(build(), APP, probe, capture)
    await result
    expect(urls).toEqual([
      'http://127.0.0.1:4000/api/health',
      'http://127.0.0.1:4000/',
      `http://127.0.0.1:4000${SPA_ROUTE}`,
      'http://127.0.0.1:4000/api/nope',
    ])
    expect(asked).toEqual([
      'docker compose version --short',
      'docker compose --profile app exec -T backend find /app/public',
    ])
    expect(verbs(calls)).toEqual(['up --build --wait', 'down -v'])
  })
  test.each(['2.34.1', 'v2.29.1', '1.29.2'])(
    'Compose %s fails before anything is built',
    async (found) => {
      const { probe, urls } = site(4000)
      const { calls, result } = smoke(
        build(),
        APP,
        probe,
        fakeCapture({ 'docker compose version --short': found }).capture,
      )
      const shown = found.replace(/^v/, '').replace(/\./g, '\\.')
      await expect(result).rejects.toThrow(new RegExp(`2\\.35\\.0.*${shown}`))
      expect(docker(calls)).toEqual([])
      expect(urls).toEqual([])
    },
  )
  test.each(['2.35.0', 'v2.35.0', '2.40.3', '5.5.0', 'v5.6.1'])(
    'Compose %s passes the floor',
    async (found) => {
      const { capture } = fakeCapture({ 'docker compose version --short': found })
      await smoke(build(), APP, site(4000).probe, capture).result
    },
  )
  test('a version that cannot be read fails the case before the build', async () => {
    const { capture } = fakeCapture({ 'docker compose version --short': 'dev' })
    const { calls, result } = smoke(build(), APP, site(4000).probe, capture)
    await expect(result).rejects.toThrow(/2\.35\.0/)
    expect(docker(calls)).toEqual([])
  })
  test.each([
    [
      'index without the mount point',
      at4000('/', htmlReply('<html></html>')),
      /GET \/ .*index\.html/,
    ],
    [
      'index that is not HTML',
      at4000('/', htmlReply(INDEX, 'application/json')),
      /GET \/ .*index\.html/,
    ],
    [
      'index from the dev server',
      at4000(
        '/',
        htmlReply('<div id="root"></div><script type="module" src="/src/main.tsx"></script>'),
      ),
      /GET \/ .*index\.html/,
    ],
    [
      'index missing',
      at4000('/', { status: 404, body: NOT_FOUND, contentType: 'application/json' }),
      /GET \/ .*404/,
    ],
    [
      'deep link 404',
      at4000(SPA_ROUTE, { status: 404, body: NOT_FOUND, contentType: 'application/json' }),
      /deep link .*404/,
    ],
    [
      'deep link serving other HTML',
      at4000(SPA_ROUTE, htmlReply(`${INDEX} `)),
      /deep link .*index\.html/,
    ],
    ['unknown API path answering HTML', at4000('/api/nope', htmlReply(INDEX)), /\/api\/nope .*404/],
    [
      'unknown API path with a non-JSON 404',
      at4000('/api/nope', { status: 404, body: '<h1>404</h1>', contentType: 'text/html' }),
      /\/api\/nope .*JSON/,
    ],
    [
      'unknown API path with another envelope',
      at4000('/api/nope', {
        status: 404,
        body: '{"message":"x"}',
        contentType: 'application/json',
      }),
      /\/api\/nope .*envelope/,
    ],
  ])('%s fails the case naming the check, with teardown', async (_name, overrides, message) => {
    const { calls, result } = smoke(
      build(),
      APP,
      site(4000, overrides).probe,
      fakeCapture().capture,
    )
    await expect(result).rejects.toThrow(message)
    expect(verbs(calls).at(-1)).toBe('down -v')
  })
  test.each([
    ['source files', '/app/public/index.html\n/app/public/src\n/app/public/src/main.tsx'],
    ['a dotenv file', `/app/public/index.html\n${DOTFILE}`],
    ['a source map', '/app/public/index.html\n/app/public/assets/index-AbC123.js.map'],
    ['nothing', ''],
  ])('public/ with %s fails the case', async (_name, listing) => {
    const { capture } = fakeCapture({ 'find /app/public': listing })
    const { calls, result } = smoke(build(), APP, site(4000).probe, capture)
    await expect(result).rejects.toThrow(/public\//)
    expect(verbs(calls).at(-1)).toBe('down -v')
  })
  test('runs the frontend e2e against the server port before the teardown, and only with --e2e', async () => {
    const withE2e = smoke(build(true), E2E, site(4000).probe, fakeCapture().capture)
    await withE2e.result
    // runPackages runs the dev-flow e2e first (no E2E_BASE_URL); the container run is the other.
    expect(e2eCalls(withE2e.calls)).toHaveLength(2)
    const against = againstApp(withE2e.calls)
    expect(against.map((x) => x.vars?.E2E_BASE_URL)).toEqual(['http://127.0.0.1:4000'])
    const order = withE2e.calls.map((x) => x)
    const down = order.findIndex((x) => x.line.includes(' down '))
    const up = order.findIndex((x) => x.line.includes(' up '))
    const ran = order.indexOf(against[0] as Call)
    expect(up).toBeLessThan(ran)
    expect(ran).toBeLessThan(down)
    const without = smoke(build(true), APP, site(4000).probe, fakeCapture().capture)
    await without.result
    expect(e2eCalls(without.calls)).toEqual([])
  })
  test('a failing e2e fails the case and the teardown still runs', async () => {
    const { calls, result } = smoke(
      build(true),
      E2E,
      site(4000).probe,
      fakeCapture().capture,
      (line, vars) => line === 'bun ./ok.ts e2e' && vars?.E2E_BASE_URL !== undefined,
    )
    await expect(result).rejects.toThrow('boom bun ./ok.ts e2e')
    expect(verbs(calls).at(-1)).toBe('down -v')
  })
})

describe('app smoke, split', () => {
  const build = (e2e = false) => stackCatalog({ frontend: 'mini-spa', deploy: 'split', e2e })
  test('probes the server, then the SPA and the proxy through the frontend port, and checks the user', async () => {
    const { probe, urls } = site(5173)
    const { capture, asked } = fakeCapture()
    const { calls, result } = smoke(build(), APP, probe, capture)
    await result
    expect(urls).toEqual([
      'http://127.0.0.1:4000/api/health',
      'http://127.0.0.1:5173/api/health',
      'http://127.0.0.1:5173/',
      `http://127.0.0.1:5173${SPA_ROUTE}`,
      'http://127.0.0.1:5173/api/nope',
    ])
    expect(asked).toEqual(['docker compose --profile app exec -T frontend id -u'])
    expect(verbs(calls)).toEqual(['up --build --wait', 'down -v'])
  })
  test('does not check the Compose floor', async () => {
    const { capture, asked } = fakeCapture({ 'docker compose version --short': '2.1.0' })
    await smoke(build(), APP, site(5173).probe, capture).result
    expect(asked.some((line) => line.includes('version'))).toBe(false)
  })
  test.each([
    ['root', '0'],
    ['unreadable', 'oops'],
  ])('a frontend container whose user is %s fails the case', async (_name, uid) => {
    const { calls, result } = smoke(
      build(),
      APP,
      site(5173).probe,
      fakeCapture({ 'id -u': uid }).capture,
    )
    await expect(result).rejects.toThrow(/non-root/)
    expect(verbs(calls).at(-1)).toBe('down -v')
  })
  test('the proxy not answering fails naming the check', async () => {
    const probe = site(5173, {
      'http://127.0.0.1:5173/api/health': new Error('connection refused'),
    }).probe
    // The wait retries for 60 s; a clock that jumps 20 s per reading makes that instant.
    let clock = 0
    const realNow = Date.now
    const realSetTimeout = globalThis.setTimeout
    Date.now = () => (clock += 20_000)
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout
    try {
      const { calls, result } = smoke(build(), APP, probe, fakeCapture().capture)
      await expect(result).rejects.toThrow(/5173\/api\/health.*connection refused/)
      expect(verbs(calls).at(-1)).toBe('down -v')
    } finally {
      Date.now = realNow
      globalThis.setTimeout = realSetTimeout
    }
  })
  test('an index the proxy answers with a 404 fails the case', async () => {
    const reply: ProbeResult = { status: 404, body: '', contentType: 'text/html' }
    const probe = site(5173, { 'http://127.0.0.1:5173/': reply }).probe
    await expect(smoke(build(), APP, probe, fakeCapture().capture).result).rejects.toThrow(
      /GET \/ .*404/,
    )
  })
  test('runs the e2e against the frontend port', async () => {
    const { calls, result } = smoke(build(true), E2E, site(5173).probe, fakeCapture().capture)
    await result
    expect(againstApp(calls).map((x) => x.vars?.E2E_BASE_URL)).toEqual(['http://127.0.0.1:5173'])
  })
})

describe('app smoke, a frontend that is not an SPA', () => {
  test('keeps the server-port probe only: no capture, no SPA checks, no e2e against the container', async () => {
    const built = stackCatalog({ frontend: 'mini-ui', deploy: 'split', e2e: true })
    const urls: string[] = []
    const probe: Probe = async (url) => {
      urls.push(url)
      return { status: 200, body: '' }
    }
    const capture: Capture = () => {
      throw new Error('nothing to capture')
    }
    const { calls, result } = smoke(built, E2E, probe, capture)
    await result
    expect(urls).toEqual(['http://127.0.0.1:4000/api/health'])
    expect(verbs(calls)).toEqual(['up --build --wait', 'down -v'])
    expect(againstApp(calls)).toEqual([])
  })
})
