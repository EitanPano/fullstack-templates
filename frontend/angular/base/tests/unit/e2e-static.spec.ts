// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net' // @server
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../../scripts/e2e-static.mjs', import.meta.url))

// @server-start
interface Seen {
  method: string | undefined
  url: string | undefined
  headers: http.IncomingHttpHeaders
  body: string
}
// @server-end

let dist: string
let api: http.Server // @server
let child: ChildProcess
let origin: string
const seen: Seen[] = [] // @server

// @server-start
function listen(server: http.Server): Promise<number> {
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      done((server.address() as AddressInfo).port)
    })
  })
}
// @server-end

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), 'e2e-static-'))
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>shell</title>')
  writeFileSync(join(dist, 'main-ABCDEFGH.js'), 'export {}')
  writeFileSync(join(dist, 'styles-ABCDEFGH.css'), 'body{}')
  writeFileSync(join(dist, 'manifest.webmanifest'), '{}')
  writeFileSync(join(dist, '.secret'), 'nope')
  mkdirSync(join(dist, 'i18n'))
  writeFileSync(join(dist, 'i18n', 'he.json'), '{}')

  // @server-start
  // A stub API that records what reaches it and answers with two cookies.
  api = http.createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      seen.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      })
      res.writeHead(201, {
        'content-type': 'application/json',
        'set-cookie': ['a=1; HttpOnly', 'b=2; Path=/'],
      })
      res.end('{"ok":true}')
    })
  })
  const apiPort = await listen(api)
  // @server-end

  child = spawn(process.execPath, [SCRIPT], {
    env: {
      ...process.env,
      PORT: '0',
      DIST_DIR: dist,
      API_URL: `http://127.0.0.1:${String(apiPort)}`, // @server
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  origin = await new Promise<string>((done, fail) => {
    child.on('error', fail)
    child.stdout?.on('data', (chunk: Buffer) => {
      const found = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk.toString())
      if (found) done(found[0])
    })
  })
})

// @server-start
afterAll(async () => {
  child.kill()
  await new Promise((done) => api.close(done))
})
// @server-end
// @noserver-start
afterAll(() => {
  child.kill()
})
// @noserver-end

const get = (path: string, init?: RequestInit) => fetch(origin + path, init)

describe('scripts/e2e-static.mjs', () => {
  it('serves the shell and gives a deep link the shell too', async () => {
    for (const path of ['/', '/auth/login', '/profile?tab=2']) {
      const response = await get(path)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(await response.text()).toContain('<title>shell</title>')
    }
  })

  it('serves files with their content types', async () => {
    const types: [string, string][] = [
      ['/main-ABCDEFGH.js', 'text/javascript'],
      ['/styles-ABCDEFGH.css', 'text/css'],
      ['/manifest.webmanifest', 'application/manifest+json'],
      ['/i18n/he.json', 'application/json'],
    ]
    for (const [path, type] of types) {
      const response = await get(path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toContain(type)
    }
  })

  it('answers 404 for a missing file with an extension, never the shell', async () => {
    const response = await get('/no-such-file.js')
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('shell')
  })

  it('refuses a dotfile, an encoded traversal and a backslash', async () => {
    for (const path of [
      '/.secret',
      '/%2e%2e/package.json',
      '/..%2f..%2fpackage.json',
      '/a%5c..%5cb',
    ]) {
      expect((await get(path)).status, path).toBe(404)
    }
  })

  it('answers 400 to a malformed request target and keeps serving', async () => {
    // fetch normalises the URL, so send the raw target on a plain socket.
    for (const target of ['//', '///']) {
      const status = await new Promise<number>((done, fail) => {
        const request = http.request(
          { host: '127.0.0.1', port: Number(new URL(origin).port), path: target, method: 'GET' },
          (response) => {
            response.resume()
            done(response.statusCode ?? 0)
          },
        )
        request.on('error', fail)
        request.end()
      })
      expect(status, target).toBe(400)
    }
    expect((await get('/')).status).toBe(200)
  })

  it('refuses a method other than GET and HEAD outside /api', async () => { // @server
  it('refuses a method other than GET and HEAD', async () => { // @noserver
    expect((await get('/', { method: 'POST' })).status).toBe(405)
  })

  // @server-start
  it('proxies /api with the method, headers, body and cookies passed both ways', async () => {
    seen.length = 0
    const response = await get('/api/auth/login?x=1', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: 'session=abc', 'x-request-id': 'r1' },
      body: '{"email":"a@b.c"}',
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.getSetCookie()).toEqual(['a=1; HttpOnly', 'b=2; Path=/'])
    expect(seen).toHaveLength(1)
    expect(seen[0]?.method).toBe('POST')
    expect(seen[0]?.url).toBe('/api/auth/login?x=1')
    expect(seen[0]?.body).toBe('{"email":"a@b.c"}')
    expect(seen[0]?.headers['cookie']).toBe('session=abc')
    expect(seen[0]?.headers['x-request-id']).toBe('r1')
    expect(seen[0]?.headers['x-forwarded-proto']).toBe('http')
    expect(seen[0]?.headers['x-forwarded-for']).toBe('127.0.0.1')
  })

  it('appends to an x-forwarded-for chain instead of replacing it', async () => {
    seen.length = 0
    await get('/api/health', { headers: { 'x-forwarded-for': '203.0.113.9' } })

    expect(seen[0]?.headers['x-forwarded-for']).toBe('203.0.113.9, 127.0.0.1')
  })

  it('answers 502 when the API is down', async () => {
    const down = http.createServer()
    const port = await listen(down)
    await new Promise((done) => down.close(done))
    const lone = spawn(process.execPath, [SCRIPT], {
      env: {
        ...process.env,
        PORT: '0',
        DIST_DIR: dist,
        API_URL: `http://127.0.0.1:${String(port)}`,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    })
    try {
      const where = await new Promise<string>((done) => {
        lone.stdout.on('data', (chunk: Buffer) => {
          const found = /http:\/\/127\.0\.0\.1:\d+/.exec(chunk.toString())
          if (found) done(found[0])
        })
      })
      expect((await fetch(`${where}/api/health`)).status).toBe(502)
    } finally {
      lone.kill()
    }
  })
  // @server-end
})
