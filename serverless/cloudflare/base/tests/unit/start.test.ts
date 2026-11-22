// `start` on a fixture frontend output: it assembles dist/ and serves it with `wrangler dev`
// on one origin (the Worker with its assets). A page keeps its own policy meta and carries the fixed Content-Security-Policy
// header, and never runs the Worker (no request id); a page without a meta is served and warned
// about; the 404 page answers 404; /api/health answers from the Worker with a request id.
// Everything of the run lives in a scratch folder (output, state) on a port the OS chose, and the
// script is started from another directory: the package's own dist/ is never touched. The
// server's whole process tree is ended afterwards.
// @frontends-start
// Beside several frontends a request names its host: Node resolves no `<dir>.localhost`, so each
// request goes to 127.0.0.1 with the host header set.
// @frontends-end
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { spawnSync } from 'node:child_process' // @frontends
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http' // @frontends
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const HASH = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const meta = `<meta http-equiv="content-security-policy" content="script-src &#39;self&#39; ${HASH.replaceAll("'", '&#39;')}; style-src &#39;self&#39;;">`
const html = (title: string, withMeta = true) =>
  `<!doctype html><html><head>${withMeta ? meta : ''}<title>${title}</title></head><body><h1>${title}</h1></body></html>`

type Started = { origin: string; port: number; child: ChildProcess; stderr: () => string }
const started: Started[] = []
const scratches: string[] = []

// Asks the OS for a free port, then releases it.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

// taskkill exits non-zero when a process of the tree ended on its own while it walked the tree:
// the server is gone either way, so the cleanup must not fail the run.
function stop(child: ChildProcess): void {
  if (child.pid === undefined) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${String(child.pid)} /T /F`, { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  } catch {
    // Already gone.
  }
}

// A scratch folder for one run: the script's output and state live here, never in the package.
function scratch(): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'start-'))
  scratches.push(folder)
  return folder
}

// Starts `start.mjs` from another directory, waits for /api/health, and remembers it to stop it.
async function launch(folder: string, extra: string[]): Promise<Started> {
  const port = await freePort()
  const origin = `http://127.0.0.1:${String(port)}`
  let stderr = ''
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'scripts/start.mjs'),
      '--port',
      String(port),
      '--persist-to',
      path.join(folder, 'state'),
      '--out',
      path.join(folder, 'dist'),
      ...extra,
    ],
    // Not the package root: the script finds its package from its own location.
    { cwd: folder, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const run = { origin, port, child, stderr: () => stderr }
  started.push(run)
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      if ((await fetch(`${origin}/api/health`)).status === 200) return run
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error('/api/health did not answer within 90000 ms')
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

afterAll(async () => {
  for (const run of started) stop(run.child)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  for (const folder of scratches) {
    rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  }
})

// @nofrontends-start
let run: Started
let origin = ''

beforeAll(async () => {
  const folder = scratch()
  const out = path.join(folder, 'out')
  mkdirSync(out)
  writeFileSync(path.join(out, 'index.html'), html('Home'))
  writeFileSync(path.join(out, '404.html'), html('Missing page'))
  writeFileSync(path.join(out, 'plain.html'), html('Plain page', false))
  writeFileSync(path.join(out, '_headers'), '/plain\n  X-Fixture-Rule: from-the-build\n')
  writeFileSync(path.join(out, '_redirects'), '/old-address /plain 301\n')
  run = await launch(folder, ['--frontend', out])
  origin = run.origin
}, 120_000)

describe('start', () => {
  it('serves a page with its own policy meta and the fixed header, with no Worker invocation', async () => {
    const response = await fetch(`${origin}/`)
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(response.status).toBe(200)
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).not.toMatch(/default-src|script-src|style-src/)
    expect(csp).not.toContain('unsafe-inline')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-request-id')).toBeNull()
    const body = await response.text()
    expect(body).toContain('content-security-policy')
    expect(body).toContain(HASH.replaceAll("'", '&#39;'))
  })

  it('serves a page without a meta as it is, under the fixed header, and warned about it', async () => {
    const response = await fetch(`${origin}/plain`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(await response.text()).not.toContain('content-security-policy')
    expect(run.stderr()).toContain('served without a script policy')
    expect(run.stderr()).toContain('plain.html')
  })

  it('applies a _headers rule of the build, beside the template’s own, to the page it names', async () => {
    const named = await fetch(`${origin}/plain`)
    const other = await fetch(`${origin}/`)

    expect(named.headers.get('x-fixture-rule')).toBe('from-the-build')
    expect(named.headers.get('x-content-type-options')).toBe('nosniff')
    expect(other.headers.get('x-fixture-rule')).toBeNull()
  })

  it('applies a _redirects rule of the build', async () => {
    const response = await fetch(`${origin}/old-address`, { redirect: 'manual' })

    expect(response.status).toBe(301)
    expect(new URL(response.headers.get('location') ?? '', origin).pathname).toBe('/plain')
  })

  it('answers an unknown path with the 404 page and status 404', async () => {
    const response = await fetch(`${origin}/no-such-page`)

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Missing page')
    expect(response.headers.get('x-request-id')).toBeNull()
  })

  it('answers /api/health from the Worker with a request id', async () => {
    const response = await fetch(`${origin}/api/health`)

    expect(response.status).toBe(200)
    expect(response.headers.get('x-request-id')).toMatch(/\S{8,}/)
    expect(await response.json()).toMatchObject({ status: 'ok' })
  })

  it('answers an unknown /api path with the JSON envelope, not the 404 page', async () => {
    const response = await fetch(`${origin}/api/no-such-endpoint`)

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } })
  })

  it('refuses /api/admin with 403 on any host: the template ships no gate', async () => {
    const response = await fetch(`${origin}/api/admin/probe`)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } })
  })
})
// @nofrontends-end
// @frontends-start
const dirs = (JSON.parse('__FRONTENDS__') as { dir: string }[]).map((frontend) => frontend.dir)
const [first = '', second = ''] = dirs
const hostOf = (dir: string) => `${dir}.localhost`

type Answer = { status: number; headers: Record<string, string | string[] | undefined>; text: string }

// A GET to 127.0.0.1 naming `host` (a frontend's local host, a name the map lacks, 127.0.0.1).
function get(on: Started, route: string, host: string): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: on.port,
        path: route,
        headers: { Host: `${host}:${String(on.port)}` },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.once('error', reject)
    req.end()
  })
}

// One build per frontend: its own pages, a 404 page of its own, and the first one's rules.
function build(folder: string, dir: string): string {
  const out = path.join(folder, `out-${dir}`)
  mkdirSync(out)
  writeFileSync(path.join(out, 'index.html'), html(`Home of ${dir}`))
  writeFileSync(path.join(out, '404.html'), html(`Missing page of ${dir}`))
  if (dir === first) {
    writeFileSync(path.join(out, 'plain.html'), html('Plain page', false))
    writeFileSync(path.join(out, '_headers'), '/plain\n  X-Fixture-Rule: from-the-build\n')
    writeFileSync(path.join(out, '_redirects'), '/old-address /plain 301\n')
  } else {
    writeFileSync(path.join(out, '_headers'), '/*\n  X-Other-Frontend: yes\n')
  }
  return out
}

let pair: Started

beforeAll(async () => {
  const folder = scratch()
  const args = dirs.flatMap((dir) => ['--frontend', `${dir}=${build(folder, dir)}`])
  pair = await launch(folder, args)
}, 120_000)

describe('start with several frontends', () => {
  it('serves each frontend on its own host from its own folder, with the fixed header and no Worker invocation', async () => {
    for (const dir of dirs) {
      const res = await get(pair, '/', hostOf(dir))
      const csp = String(res.headers['content-security-policy'])

      expect(res.status).toBe(200)
      expect(res.text).toContain(`Home of ${dir}`)
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).not.toMatch(/default-src|script-src|style-src/)
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    }
  })

  it('answers a host the map does not name with a 404, and gives no page or listing', async () => {
    for (const host of ['example.com', '127.0.0.1', `x.${hostOf(first)}`]) {
      const res = await get(pair, '/', host)

      expect(res.status, host).toBe(404)
      expect(JSON.parse(res.text)).toMatchObject({ error: { code: 'not_found' } })
      expect(res.text).not.toContain('Home of')
    }
    expect((await get(pair, `/${first}/`, 'example.com')).status).toBe(404)
  })

  it('keeps one host out of another frontend’s folder', async () => {
    for (const route of [`/${second}/`, `/${second}/index.html`]) {
      const res = await get(pair, route, hostOf(first))

      expect(res.status, route).toBe(404)
      expect(res.text, route).not.toContain(`Home of ${second}`)
      expect(res.text, route).toContain(`Missing page of ${first}`)
    }
    // Dot segments, encoded or not, are resolved before the host picks a folder; a redirect the
    // assets answer with (an encoded slash is decoded) is followed on the same host.
    for (const route of [`/../${second}/`, `/%2e%2e/${second}/`, `/..%2f${second}/index.html`]) {
      let res = await get(pair, route, hostOf(first))
      if (res.status >= 300 && res.status < 400) {
        const next = new URL(String(res.headers.location), 'http://x')
        res = await get(pair, next.pathname + next.search, hostOf(first))
      }

      expect(res.status, route).toBe(404)
      expect(res.text, route).not.toContain(`Home of ${second}`)
    }
    const back = await get(pair, `/${first}/index.html`, hostOf(second))
    expect(back.text).not.toContain(`Home of ${first}`)
  })

  it('answers the 404 page of the frontend’s own folder, with status 404 and no request id', async () => {
    for (const dir of dirs) {
      const res = await get(pair, '/no-such-page', hostOf(dir))

      expect(res.status).toBe(404)
      expect(res.text).toContain(`Missing page of ${dir}`)
      expect(res.headers['x-request-id']).toBeUndefined()
    }
  })

  it('applies a frontend’s _headers to its folder only, with the template’s own beside it', async () => {
    const named = await get(pair, '/plain', hostOf(first))
    const home = await get(pair, '/', hostOf(first))
    const other = await get(pair, '/', hostOf(second))

    expect(named.headers['x-fixture-rule']).toBe('from-the-build')
    expect(named.headers['x-content-type-options']).toBe('nosniff')
    expect(home.headers['x-fixture-rule']).toBeUndefined()
    expect(other.headers['x-other-frontend']).toBe('yes')
    expect(home.headers['x-other-frontend']).toBeUndefined()
  })

  it('applies a frontend’s _redirects and takes the folder out of the Location', async () => {
    const res = await get(pair, '/old-address', hostOf(first))

    expect(res.status).toBe(301)
    expect(new URL(String(res.headers.location), 'http://x').pathname).toBe('/plain')
    const dotHtml = await get(pair, '/plain.html', hostOf(first))
    expect([301, 302, 307, 308]).toContain(dotHtml.status)
    expect(String(dotHtml.headers.location)).not.toContain(`/${first}/`)
  })

  it('serves a page without a meta as it is and warns, naming its folder', async () => {
    const res = await get(pair, '/plain', hostOf(first))

    expect(res.status).toBe(200)
    expect(res.text).not.toContain('content-security-policy')
    expect(pair.stderr()).toContain('served without a script policy')
    expect(pair.stderr()).toContain(`${first}/plain.html`)
  })

  it('answers /api/health on any host with a request id, and an unknown /api path with the envelope', async () => {
    for (const host of [hostOf(first), hostOf(second), '127.0.0.1', 'example.com']) {
      const res = await get(pair, '/api/health', host)

      expect(res.status, host).toBe(200)
      expect(String(res.headers['x-request-id'])).toMatch(/\S{8,}/)
      expect(JSON.parse(res.text)).toMatchObject({ status: 'ok' })
    }
    const unknown = await get(pair, '/api/no-such-endpoint', hostOf(first))
    expect(unknown.status).toBe(404)
    expect(JSON.parse(unknown.text)).toMatchObject({ error: { code: 'not_found' } })
  })

  it('answers /api/admin on the admin host only: 403 from the gate there, 404 elsewhere', async () => {
    for (const dir of dirs) {
      const res = await get(pair, '/api/admin/probe', hostOf(dir))
      const body = JSON.parse(res.text) as { error: { code: string } }

      expect(res.status, dir).toBe(dirs.includes('admin') && dir !== 'admin' ? 404 : 403)
      expect(body.error.code).toBe(dirs.includes('admin') && dir !== 'admin' ? 'not_found' : 'forbidden')
    }
    expect((await get(pair, '/api/admin/probe', '127.0.0.1')).status).toBe(
      dirs.includes('admin') ? 404 : 403,
    )
  })
})

describe('start with --only', () => {
  it('assembles and serves that frontend alone, and needs no build of the others', async () => {
    const folder = scratch()
    const out = build(folder, second)
    const only = await launch(folder, ['--frontend', `${second}=${out}`, '--only', second])

    const served = await get(only, '/', hostOf(second))
    expect(served.status).toBe(200)
    expect(served.text).toContain(`Home of ${second}`)
    const absent = await get(only, '/', hostOf(first))
    expect(absent.text).not.toContain(`Home of ${first}`)
    expect((await get(only, '/api/health', hostOf(first))).status).toBe(200)
  }, 120_000)

  it('fails naming the frontend whose build is missing when --only is not given', () => {
    const folder = scratch()
    const out = build(folder, first)
    const gone = path.join(folder, 'no-build')
    const failed = spawnSyncAssemble(folder, [
      '--frontend',
      `${first}=${out}`,
      '--frontend',
      `${second}=${gone}`,
    ])

    expect(failed.status).not.toBe(0)
    expect(failed.stderr).toContain(`frontend "${second}"`)
    expect(failed.stderr).toContain('missing or empty')
  })
})

// `assemble` alone, in the scratch folder, with the given arguments.
function spawnSyncAssemble(folder: string, extra: string[]) {
  const outcome = spawnSync(
    process.execPath,
    [path.join(root, 'scripts/assemble.mjs'), '--out', path.join(folder, 'dist'), ...extra],
    { cwd: folder, encoding: 'utf8' },
  )
  return { status: outcome.status, stderr: outcome.stderr }
}
// @frontends-end
