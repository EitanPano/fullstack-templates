import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { Request, Response } from 'express'
import type { Server } from 'node:http'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { env } from '../../src/config/env'
import { staticFiles } from '../../src/middleware/static'
import { createApp } from '../../src/server'

// Probes go through node:http so the request path reaches the server byte for byte; a client
// library may normalise `..` or `%2e` before sending.
type Reply = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function raw(
  target: Server,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  const { port } = target.address() as AddressInfo
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString(),
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function listen(app: ReturnType<typeof createApp>): Promise<Server> {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      resolve(s)
    })
  })
}

const INDEX = '<!doctype html><title>spa</title>'
const IMMUTABLE = 'public, max-age=31536000, immutable'
let root: string
let dist: string
let server: Server

function expectEnvelope(res: Reply): void {
  expect(res.status).toBe(404)
  expect(res.headers['content-type']).toContain('application/json')
  const body = JSON.parse(res.body) as { error: { code: string }; requestId: string }
  expect(body.error.code).toBe('not_found')
  expect(body.requestId).toBeTruthy()
}

// The security headers and the request id sit on every response, static ones included.
function expectCommonHeaders(res: Reply): void {
  expect(res.headers['content-security-policy']).toContain("default-src 'self'")
  expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests')
  expect(res.headers['x-content-type-options']).toBe('nosniff')
  expect(res.headers['x-request-id']).toBeTruthy()
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'static-'))
  dist = join(root, 'dist')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  mkdirSync(join(dist, '.git'), { recursive: true })
  mkdirSync(join(dist, 'sub'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), INDEX)
  writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)')
  writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(join(dist, 'sub', 'page.html'), '<p>sub</p>')
  writeFileSync(join(dist, '.env'), 'SECRET=1')
  writeFileSync(join(dist, '.git', 'config'), '[core]')
  writeFileSync(join(root, 'canary.txt'), 'CANARY')
  writeFileSync(join(root, 'canary-plain'), 'CANARY')
  mkdirSync(join(root, 'outside'))
  writeFileSync(join(root, 'outside', 'secret.txt'), 'CANARY')
  writeFileSync(join(root, 'outside', 'plain'), 'CANARY')
  // A junction is a directory link that needs no privilege on Windows; elsewhere the type is
  // ignored and this is an ordinary symlink, so the row runs on every OS.
  symlinkSync(join(root, 'outside'), join(dist, 'linkdir'), 'junction')
  // A file link needs a privilege on Windows, so there the junction below stands in for it.
  if (process.platform !== 'win32') symlinkSync(join(root, 'canary-plain'), join(dist, 'linkfile'))
  server = await listen(createApp(dist))
})

afterAll(() => {
  server.close()
  rmSync(root, { recursive: true, force: true })
})

describe('static: existing file', () => {
  it('GET serves an asset with the immutable cache header', async () => {
    const res = await raw(server, 'GET', '/assets/app-abc123.js')

    expect(res.status).toBe(200)
    expect(res.body).toBe('console.log(1)')
    expect(res.headers['cache-control']).toBe(IMMUTABLE)
    expectCommonHeaders(res)
  })

  it('HEAD serves the headers of an asset and no body', async () => {
    const res = await raw(server, 'HEAD', '/assets/app-abc123.js')

    expect(res.status).toBe(200)
    expect(res.body).toBe('')
    expect(res.headers['content-length']).toBe('14')
    expect(res.headers['cache-control']).toBe(IMMUTABLE)
    expectCommonHeaders(res)
  })

  it('serves /index.html with no-cache', async () => {
    const res = await raw(server, 'GET', '/index.html')

    expect(res.status).toBe(200)
    expect(res.body).toBe(INDEX)
    expect(res.headers['cache-control']).toBe('no-cache')
    expectCommonHeaders(res)
  })

  it('serves a root file outside assets with no-cache, like the shell', async () => {
    const res = await raw(server, 'GET', '/favicon.svg')

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-cache')
    expectCommonHeaders(res)
  })

  it('does not compress, even when the client accepts it', async () => {
    for (const path of ['/assets/app-abc123.js', '/dashboard']) {
      const res = await raw(server, 'GET', path, { 'accept-encoding': 'gzip, br' })

      expect(res.status).toBe(200)
      expect(res.headers['content-encoding']).toBeUndefined()
    }
  })

  it('serves a file in a subdirectory', async () => {
    const res = await raw(server, 'GET', '/sub/page.html')

    expect(res.status).toBe(200)
    expect(res.body).toBe('<p>sub</p>')
    expectCommonHeaders(res)
  })
})

describe('static: SPA fallback', () => {
  it('GET of an extension-less path returns index.html with no-cache', async () => {
    const res = await raw(server, 'GET', '/dashboard')

    expect(res.status).toBe(200)
    expect(res.body).toBe(INDEX)
    expect(res.headers['cache-control']).toBe('no-cache')
    expect(res.headers['content-type']).toContain('text/html')
    expectCommonHeaders(res)
  })

  it('HEAD of an extension-less path returns the headers only', async () => {
    const res = await raw(server, 'HEAD', '/dashboard')

    expect(res.status).toBe(200)
    expect(res.body).toBe('')
    expect(res.headers['cache-control']).toBe('no-cache')
    expectCommonHeaders(res)
  })

  it('serves the root path /', async () => {
    const res = await raw(server, 'GET', '/')

    expect(res.status).toBe(200)
    expect(res.body).toBe(INDEX)
    expect(res.headers['cache-control']).toBe('no-cache')
    expectCommonHeaders(res)
  })

  it('serves a nested route, a trailing slash and a query string', async () => {
    for (const path of ['/a/b/c', '/a/', '/a?x=1', '/a/?x=1']) {
      const res = await raw(server, 'GET', path)

      expect(res.status).toBe(200)
      expect(res.body).toBe(INDEX)
      expectCommonHeaders(res)
    }
  })
})

describe('static: misses and API', () => {
  it('a path with an extension and no file is the JSON 404', async () => {
    const res = await raw(server, 'GET', '/assets/missing.js')

    expectEnvelope(res)
    expectCommonHeaders(res)
  })

  it('an uppercase extension with no file is the JSON 404', async () => {
    expectEnvelope(await raw(server, 'GET', '/NOPE.JS'))
    expectEnvelope(await raw(server, 'GET', '/nope.HTML'))
  })

  it('/api/* with no route is the JSON 404, never index.html', async () => {
    for (const path of ['/api/nope', '/api', '/api/', '/api/user/x/y', '/API/nope', '/Api']) {
      const res = await raw(server, 'GET', path)

      expectEnvelope(res)
      expectCommonHeaders(res)
    }
  })

  it('an encoded /api is still /api: the JSON 404, never index.html', async () => {
    for (const path of ['/%61pi/nope', '/api%2Fnope', '/%41PI/x', '/%61pi', '/%61pi/']) {
      const res = await raw(server, 'GET', path)

      expectEnvelope(res)
      expectCommonHeaders(res)
    }
  })

  it('an encoded path to a real API route is not the shell either', async () => {
    // Express routes on the raw path, so `/%61pi/health` matches no route and is the JSON 404
    // (python-fastapi routes on the decoded path and answers 200). Neither serves index.html.
    const res = await raw(server, 'GET', '/%61pi/health')

    expectEnvelope(res)
    expect(res.body).not.toContain(INDEX)
  })

  it('every API answer is the same with STATIC_DIR set as without it', async () => {
    const comparable = (body: string) =>
      body.replace(/"requestId":"[^"]*"/g, '').replace(/"uptimeSeconds":\d+/g, '')
    const without = await listen(createApp())
    try {
      const requests: [string, string][] = [
        ['POST', '/api/health'],
        ['DELETE', '/api/health'],
        ['GET', '/api/health/'],
        ['GET', '/api/health'],
        ['GET', '/api/nope'],
        ['PUT', '/api/nope'],
      ]
      for (const [method, path] of requests) {
        const a = await raw(server, method, path)
        const b = await raw(without, method, path)

        expect([method, path, a.status, a.headers.allow, a.headers['content-type']]).toEqual([
          method,
          path,
          b.status,
          b.headers.allow,
          b.headers['content-type'],
        ])
        // The request id and the health uptime differ between two apps by design.
        expect(comparable(a.body)).toBe(comparable(b.body))
      }
    } finally {
      without.close()
    }
  })
  it('an existing API route still answers', async () => {
    const res = await raw(server, 'GET', '/api/health')

    expect(res.status).toBe(200)
  })

  it('serves /openapi.json from the app, not the static directory', async () => {
    const res = await raw(server, 'GET', '/openapi.json')

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
  })

  it('POST, PUT, PATCH and DELETE on a non-API path are the JSON 404', async () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expectEnvelope(await raw(server, method, '/dashboard'))
      expectEnvelope(await raw(server, method, '/assets/app-abc123.js'))
      expectEnvelope(await raw(server, method, '/'))
    }
  })
})

describe('static: dotfiles, directories and traversal', () => {
  it('dotfiles are the JSON 404', async () => {
    for (const path of [
      '/.env',
      '/.git/config',
      '/.git',
      '/.git/',
      '/assets/.hidden',
      '/.well-known/x',
    ]) {
      const res = await raw(server, 'GET', path)

      expectEnvelope(res)
      expectCommonHeaders(res)
    }
  })

  it('a directory is the JSON 404, with or without the slash', async () => {
    for (const path of ['/assets/', '/assets', '/sub', '/sub/']) {
      expectEnvelope(await raw(server, 'GET', path))
    }
  })

  const probes = [
    '/../x',
    '/%2e%2e/x',
    '/%2e%2e%2fx',
    '/..%2fx',
    '/..%5cx',
    '/%5c..%5cx',
    '/assets/%2e%2e/index.html',
    '/%00',
    '/..%2fcanary.txt',
    '/%2e%2e/canary.txt',
    '/assets/..%2f..%2fcanary.txt',
    '/assets/%2e%2e%2f%2e%2e%2fcanary.txt',
    '/..%5ccanary.txt',
    '/assets/..%5c..%5ccanary.txt',
    '/%2e%2e%5ccanary.txt',
    '/index.html%00.txt',
    '/%ff',
    '/%',
  ]
  for (const path of probes) {
    it(`traversal probe ${path} is the JSON 404 and leaks nothing`, async () => {
      const res = await raw(server, 'GET', path)

      expect(res.body).not.toContain('CANARY')
      expectEnvelope(res)
    })
  }

  it('a double-encoded dot-dot is one literal segment, not traversal', async () => {
    const res = await raw(server, 'GET', '/%252e%252e/x')

    expect(res.body).not.toContain('CANARY')
    expect([200, 404]).toContain(res.status)
  })

  it('a file outside the directory next to it is never served', async () => {
    const res = await raw(server, 'GET', '/../canary.txt')

    expect(res.body).not.toContain('CANARY')
  })

  it('a path through a directory link that leaves the directory is the JSON 404', async () => {
    for (const path of ['/linkdir/secret.txt', '/linkdir', '/linkdir/']) {
      const res = await raw(server, 'GET', path)

      expect(res.body).not.toContain('CANARY')
      expectEnvelope(res)
    }
  })

  it('an extension-less file that leaves the directory through a link is the JSON 404', async () => {
    // `/linkdir/plain` is a file with no extension reached through a junction to an outside
    // directory: realpath leaves the root, the same check a file symlink (`/linkfile`, where
    // the OS allows one unprivileged) trips.
    const paths = ['/linkdir/plain']
    if (process.platform !== 'win32') paths.push('/linkfile')
    for (const path of paths) {
      const res = await raw(server, 'GET', path)

      expect(res.body).not.toContain('CANARY')
      expectEnvelope(res)
    }
  })

  it('an uppercase spelling of the shell is never a listing or a file outside', async () => {
    const res = await raw(server, 'GET', '/INDEX.HTML')

    expect(res.body).not.toContain('CANARY')
    // Linux compares names exactly. A case-insensitive host (Windows) may serve the file itself.
    if (process.platform === 'win32') expect([200, 404]).toContain(res.status)
    else expectEnvelope(res)
  })
})

describe('static: failure handling', () => {
  it('a failure inside the chain goes to next with the error instead of hanging', async () => {
    // A request without the fields express.static reads throws inside the promise chain.
    const failure = await new Promise<unknown>((resolve) => {
      staticFiles(dist)({ method: 'GET', path: '/x.js' } as Request, {} as Response, (error) => {
        resolve(error)
      })
    })

    expect(failure).toBeInstanceOf(Error)
  })
})

describe('static: configuration', () => {
  it('without STATIC_DIR nothing is mounted: an extension-less path is the JSON 404', async () => {
    // The test process has no STATIC_DIR, so the default app serves no files.
    expect(env.STATIC_DIR).toBeUndefined()
    const s = await listen(createApp())
    try {
      expectEnvelope(await raw(s, 'GET', '/dashboard'))
      expectEnvelope(await raw(s, 'GET', '/'))
      expectEnvelope(await raw(s, 'GET', '/index.html'))
    } finally {
      s.close()
    }
  })

  it('a STATIC_DIR that does not exist outside production answers every page with the JSON 404', async () => {
    const s = await listen(createApp(join(root, 'nope')))
    try {
      expectEnvelope(await raw(s, 'GET', '/'))
      expectEnvelope(await raw(s, 'GET', '/dashboard'))
      expectEnvelope(await raw(s, 'GET', '/assets/app.js'))
    } finally {
      s.close()
    }
  })
})
