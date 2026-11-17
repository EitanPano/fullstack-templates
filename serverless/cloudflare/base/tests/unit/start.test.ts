// `start` on a fixture frontend output: it assembles dist/ and serves it with `wrangler pages dev`
// on one origin. A page carries the lifted Content-Security-Policy and invokes no Function (no
// request id), the 404 page answers 404, and /api/health answers from the Function with a request
// id. The server is started on a port of its own and its whole process tree is ended afterwards.
import { execSync, spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const PORT = 8797
const origin = `http://127.0.0.1:${String(PORT)}`
const HASH = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const meta = `<meta http-equiv="content-security-policy" content="script-src &#39;self&#39; ${HASH.replaceAll("'", '&#39;')}; style-src &#39;self&#39;;">`
const html = (title: string) =>
  `<!doctype html><html><head>${meta}<title>${title}</title></head><body><h1>${title}</h1></body></html>`

let scratch: string
let server: ChildProcess

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
  server = spawn(
    process.execPath,
    [
      'scripts/start.mjs',
      '--port',
      String(PORT),
      '--persist-to',
      path.join(scratch, 'state'),
      '--frontend',
      out,
    ],
    { cwd: root, stdio: 'ignore' },
  )
  await waitFor('/api/health', 90_000)
}, 120_000)

afterAll(async () => {
  stop(server)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  rmSync(scratch, { recursive: true, force: true })
})

describe('start', () => {
  it('serves a page with the Content-Security-Policy header and no Function invocation', async () => {
    const response = await fetch(`${origin}/`)
    const csp = response.headers.get('content-security-policy') ?? ''

    expect(response.status).toBe(200)
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain(HASH)
    expect(csp).not.toContain('unsafe-inline')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-request-id')).toBeNull()
    expect(await response.text()).not.toContain('content-security-policy')
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
