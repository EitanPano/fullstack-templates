// `start` with an SDK build, on a running `wrangler dev` with the real assets: the files and the
// frame document are served by the Worker with its own headers, and no address reaches the frame
// document raw (without the policy that names its ancestors, or with a `_headers` rule's). The
// build is a fixture named by SDK_DIR, the keys come from the shell, as an e2e run gives them.
// Everything of the run lives in a scratch folder on a port the OS chose, and the script is started
// from another directory: the package's own dist/ is never touched. The server's whole process tree
// is ended afterwards.
import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')
const HASH = "'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='"
const meta = `<meta http-equiv="content-security-policy" content="script-src &#39;self&#39; ${HASH.replaceAll("'", '&#39;')}; style-src &#39;self&#39;;">`
const html = (title: string) =>
  `<!doctype html><html><head>${meta}<title>${title}</title></head><body><h1>${title}</h1></body></html>`

const ORIGIN = 'http://localhost:5190'
const FRAME_MARKER = 'FRAME-DOCUMENT-MARKER'
const FRAME = `<!doctype html><title>${FRAME_MARKER}</title><script src="/api/sdk/dist/v1/frame.js"></script>`
const POLICY = (ancestors: string) =>
  `default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`

// @frontends-start
// Beside several frontends each is built from the one fixture; `/api/*` answers on any host.
const frontendDirs = (JSON.parse('__FRONTENDS__') as { dir: string }[]).map(
  (frontend) => frontend.dir,
)
// @frontends-end

let child: ChildProcess | undefined
let stderr = ''
let origin = ''
let scratch = ''

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
function stop(run: ChildProcess): void {
  if (run.pid === undefined) return
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${String(run.pid)} /T /F`, { stdio: 'ignore' })
    } else {
      run.kill('SIGTERM')
    }
  } catch {
    // Already gone.
  }
}

// The request line byte for byte: fetch would normalise the address first, and these are the
// spellings a client may send.
function raw(address: string): Promise<{
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}> {
  const { port } = new URL(origin)
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port: Number(port), path: address, method: 'GET' },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk: string) => {
          body += chunk
        })
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        })
      },
    )
    req.on('error', reject)
    req.end()
  })
}

beforeAll(async () => {
  scratch = mkdtempSync(path.join(tmpdir(), 'sdk-start-'))
  const out = path.join(scratch, 'out')
  const sdk = path.join(scratch, 'sdk')
  mkdirSync(path.join(sdk, 'v1'), { recursive: true })
  mkdirSync(out)
  writeFileSync(path.join(out, 'index.html'), html('Home'))
  writeFileSync(path.join(out, '404.html'), html('Missing page'))
  writeFileSync(path.join(sdk, 'v1', 'loader.js'), '(()=>{window.__loader=1})()')
  writeFileSync(path.join(sdk, 'v1', 'frame.js'), 'console.log("frame")')
  writeFileSync(path.join(sdk, 'v1', 'frame.html'), FRAME)

  // The namespace's rate limit writes to D1: the state folder gets the migrations first, as
  // `bun run e2e:db` does for the package's own.
  const state = path.join(scratch, 'state')
  const migrated = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      state,
    ],
    { cwd: root, stdio: 'ignore' },
  )
  if (migrated.status !== 0) throw new Error('the migrations did not apply to the scratch state')

  const port = await freePort()
  origin = `http://127.0.0.1:${String(port)}`
  child = spawn(
    process.execPath,
    [
      path.join(root, 'scripts/start.mjs'),
      '--port',
      String(port),
      '--persist-to',
      state,
      '--out',
      path.join(scratch, 'dist'),
      // @nofrontends-start
      '--frontend',
      out,
      // @nofrontends-end
      // @frontends-start
      ...frontendDirs.flatMap((dir) => ['--frontend', `${dir}=${out}`]),
      // @frontends-end
    ],
    {
      cwd: scratch,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: {
        ...process.env,
        SDK_DIR: sdk,
        SDK_KEYS: `pk_start=${ORIGIN}`,
        SDK_ENABLED: 'true',
      },
    },
  )
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  const deadline = Date.now() + 90_000
  for (;;) {
    try {
      if ((await fetch(`${origin}/api/health`)).status === 200) return
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline)
      throw new Error(`/api/health did not answer within 90000 ms\n${stderr}`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}, 120_000)

afterAll(async () => {
  if (child !== undefined) stop(child)
  await new Promise((resolve) => setTimeout(resolve, 1500))
  rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
})

describe('start with an SDK build', () => {
  it('serves a script file from the assets with the Worker’s headers and none of the `_headers` rules', async () => {
    const response = await fetch(`${origin}/api/sdk/dist/v1/loader.js`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('(()=>{window.__loader=1})()')
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=300')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('x-request-id')).toBeTruthy()
    expect(response.headers.get('x-frame-options')).toBeNull()
  })

  it('serves the frame document with the one policy naming the key’s origin', async () => {
    const response = await fetch(`${origin}/api/sdk/frame/v1?k=pk_start`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe(FRAME)
    expect(response.headers.get('content-security-policy')).toBe(POLICY(ORIGIN))
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect((await fetch(`${origin}/api/sdk/frame/v1`)).headers.get('content-security-policy')).toBe(
      POLICY("'none'"),
    )
  })

  it('answers the namespace with the keys the shell gave', async () => {
    const response = await fetch(`${origin}/api/sdk/v1/config`, {
      headers: { Origin: ORIGIN, 'X-Sdk-Key': 'pk_start' },
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ enabled: true })
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect((await fetch(`${origin}/api/sdk/v1/config`)).status).toBe(403)
  })

  it('answers the 404 envelope for frame.html, whose file is not served as a script', async () => {
    const response = await fetch(`${origin}/api/sdk/dist/v1/frame.html`)

    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain(FRAME_MARKER)
    expect(response.headers.get('x-request-id')).toBeTruthy()
  })

  // Every spelling of the address a platform might resolve to the frame's file. A body that holds
  // the document is allowed only with the policy the Worker writes: its own framing rules.
  const ADDRESSES = [
    '/api/sdk/frame/v1',
    '/api/sdk/frame/v1/',
    '/api/sdk/frame/v1.html',
    '/api/sdk/frame/v1/index.html',
    '/api/sdk/frame/v1?k=pk_start',
    '/api/sdk/frame/v1#x',
    '/api/sdk/dist/v1/frame',
    '/api/sdk/dist/v1/frame.html',
    '/api/sdk/dist/v1/frame.html/',
    '/api/sdk/frame//v1',
    '//api/sdk/frame/v1',
    '/./api/sdk/frame/v1',
    '/x/../api/sdk/frame/v1',
    '/API/SDK/FRAME/V1',
    '/Api/Sdk/Frame/v1',
    '/api/SDK/frame/v1',
    '/api/sdk/FRAME/v1',
    '/api/sdk/frame/V1',
    '/%61pi/sdk/frame/v1',
    '/api/%73dk/frame/v1',
    '/api/sdk/%66rame/v1',
    '/api/sdk/frame/%76%31',
    '/api%2Fsdk/frame/v1',
    '/api/sdk%2Fframe/v1',
    '/api/sdk/frame%2Fv1',
    '/api/sdk/frame/v1%00',
    '/api/sdk/frame/v1%2e',
    '/api/sdk/frame/v1%20',
    '/api\\sdk\\frame\\v1',
    '/%2e/api/sdk/frame/v1',
    '/api/sdk/frame/v1.',
    '/api/sdk/frame/v1.HTML',
  ]

  it('never answers the frame document from any address without its policy', async () => {
    for (const address of ADDRESSES) {
      const response = await raw(address)

      if (response.body.includes(FRAME_MARKER)) {
        expect(String(response.headers['content-security-policy']), address).toMatch(
          /^default-src 'none'; script-src 'self'; .*frame-ancestors /,
        )
        expect(response.headers['x-frame-options'], address).toBeUndefined()
        expect(response.headers['x-request-id'], address).toBeTruthy()
      }
      // A redirect may only point at the Worker's own address, and carries no document.
      if (response.headers.location !== undefined) {
        expect(response.headers.location, address).toBe('/api/sdk/frame/v1')
        expect(response.body, address).not.toContain(FRAME_MARKER)
      }
    }
  })

  it('never answers a script file from an address that skips the Worker', async () => {
    const addresses = [
      '/API/SDK/DIST/v1/loader.js',
      '/%61pi/sdk/dist/v1/loader.js',
      '/api/sdk%2Fdist/v1/loader.js',
    ]
    for (const address of addresses) {
      const response = await raw(address)

      if (response.body.includes('window.__loader')) {
        expect(response.headers['x-request-id'], address).toBeTruthy()
        expect(response.headers['cache-control'], address).toBe('public, max-age=300')
      }
    }
  })
})
