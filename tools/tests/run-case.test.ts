import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { listCases } from '../lib/cases'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { runCase, type Options, type Probe } from '../lib/run-case'
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
function recordWithVars(failOn?: (line: string) => boolean) {
  const calls: Call[] = []
  const runner = (line: string, _cwd: string, vars?: NodeJS.ProcessEnv) => {
    calls.push({ line, vars })
    if (failOn?.(line)) throw new Error(`boom ${line}`)
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
    expect(docker(calls).map((d) => d.line.includes(' down -v'))).toEqual([false, true])
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
