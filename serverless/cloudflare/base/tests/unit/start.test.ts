// `start` on a fixture frontend output: it assembles dist/ and serves it with `wrangler pages dev`
// on one origin. A page keeps its own policy meta and carries the fixed Content-Security-Policy
// header, and invokes no Function (no request id); a page without a meta is served and warned
// about; the 404 page answers 404; /api/health answers from the Function with a request id.
// Everything of the run lives in a scratch folder (output, state) on a port the OS chose, and the
// script is started from another directory: the package's own dist/ is never touched. The
// server's whole process tree is ended afterwards.
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const HASH = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const meta = `<meta http-equiv="content-security-policy" content="script-src &#39;self&#39; ${HASH.replaceAll("'", '&#39;')}; style-src &#39;self&#39;;">`
const html = (title: string, withMeta = true) =>
  `<!doctype html><html><head>${withMeta ? meta : ''}<title>${title}</title></head><body><h1>${title}</h1></body></html>`

let scratch: string
let server: ChildProcess
let origin = ''
let stderr = ''

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

async function waitFor(route: string, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  for (;;) {
    try {
      const response = await fetch(`${origin}${route}`)
      if (response.status === 200) return
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`${route} did not answer within ${String(ms)} ms`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

function stop(child: ChildProcess): void {
  if (child.pid === undefined) return
  if (process.platform === 'win32') {
    execSync(`taskkill /pid ${String(child.pid)} /T /F`, { stdio: 'ignore' })
  } else {
    child.kill('SIGTERM')
  }
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'start-'))
  const out = path.join(scratch, 'out')
  mkdirSync(out)
  writeFileSync(path.join(out, 'index.html'), html('Home'))
  writeFileSync(path.join(out, '404.html'), html('Missing page'))
  writeFileSync(path.join(out, 'plain.html'), html('Plain page', false))
  const port = await freePort()
  origin = `http://127.0.0.1:${String(port)}`
  server = spawn(
    process.execPath,
    [
      path.join(root, 'scripts/start.mjs'),
      '--port',
      String(port),
      '--persist-to',
      path.join(scratch, 'state'),
      '--frontend',
      out,
      '--out',
      path.join(scratch, 'dist'),
    ],
    // Not the package root: the script finds its package from its own location.
    { cwd: scratch, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  server.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  await waitFor('/api/health', 90_000)
}, 120_000)

afterAll(async () => {
  stop(server)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

describe('start', () => {
  it('serves a page with its own policy meta and the fixed header, with no Function invocation', async () => {
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
    expect(stderr).toContain('served without a script policy')
    expect(stderr).toContain('plain.html')
  })

  it('answers an unknown path with the 404 page and status 404', async () => {
    const response = await fetch(`${origin}/no-such-page`)

    expect(response.status).toBe(404)
    expect(await response.text()).toContain('Missing page')
    expect(response.headers.get('x-request-id')).toBeNull()
  })

  it('answers /api/health from the Function with a request id', async () => {
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
})
