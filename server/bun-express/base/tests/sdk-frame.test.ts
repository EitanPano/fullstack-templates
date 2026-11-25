import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { env } from '../src/config/env'
import { createApp } from '../src/server'
import { headerCount, isEnvelope404, listen, raw } from './sdk-http'

const A = 'https://a.example.test'
const B = 'https://b.example.test'
const DOCUMENT =
  '<!doctype html><title>frame</title><script src="/api/sdk/dist/v1/frame.js"></script>'
const POLICY = (ancestors: string) =>
  `default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`

let root: string
let server: Server
let withoutBuild: Server
const original = env.SDK_KEYS

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sdk-frame-'))
  mkdirSync(join(root, 'v1'))
  writeFileSync(join(root, 'v1', 'frame.html'), DOCUMENT)
  server = await listen(createApp(undefined, root))
  withoutBuild = await listen(createApp(undefined, join(root, 'nothing-built')))
})

afterAll(() => {
  server.close()
  withoutBuild.close()
  rmSync(root, { recursive: true, force: true })
})

beforeEach(() => {
  env.SDK_KEYS = new Map([
    ['pk_test_a', [A, B]],
    ['pk_test_b', ['http://localhost:5190']],
  ])
})

afterEach(() => {
  env.SDK_KEYS = original
})

describe('GET /api/sdk/frame/v<major>?k=<key>', () => {
  it('answers the document with the one policy naming the key origins', async () => {
    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_test_a')

    expect(res.status).toBe(200)
    expect(res.body).toBe(DOCUMENT)
    expect(res.headers['content-type']).toMatch(/^text\/html/)
    expect(res.headers['content-security-policy']).toBe(POLICY(`${A} ${B}`))
    expect(headerCount(res, 'content-security-policy')).toBe(1)
  })

  it('sends no X-Frame-Options and no helmet policy beside it', async () => {
    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_test_a')

    expect(headerCount(res, 'x-frame-options')).toBe(0)
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests')
    expect(res.headers['content-security-policy']).not.toContain("'unsafe-inline'")
  })

  it('is never cached, since the header depends on the key', async () => {
    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_test_a')

    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('names one origin for a key with one', async () => {
    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_test_b')

    expect(res.headers['content-security-policy']).toBe(POLICY('http://localhost:5190'))
  })

  it("answers the document with frame-ancestors 'none' for an unknown key", async () => {
    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_unknown')

    expect(res.status).toBe(200)
    expect(res.body).toBe(DOCUMENT)
    expect(res.headers['content-security-policy']).toBe(POLICY("'none'"))
    expect(headerCount(res, 'content-security-policy')).toBe(1)
  })

  it("answers frame-ancestors 'none' for no key, an empty key and a repeated parameter", async () => {
    for (const query of ['', '?k=', '?x=pk_test_a', '?k=pk_test_a&k=pk_test_b', '?k[]=pk_test_a']) {
      const res = await raw(server, 'GET', `/api/sdk/frame/v1${query}`)

      expect(res.status, query).toBe(200)
      expect(res.headers['content-security-policy'], query).toBe(POLICY("'none'"))
    }
  })

  it("answers frame-ancestors 'none' while SDK_KEYS is unset", async () => {
    env.SDK_KEYS = undefined

    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_test_a')

    expect(res.headers['content-security-policy']).toBe(POLICY("'none'"))
  })

  it('does not let the key reach the header: only configured origins are written', async () => {
    const res = await raw(server, 'GET', '/api/sdk/frame/v1?k=pk_test_a%3B%20script-src%20*')

    expect(res.headers['content-security-policy']).toBe(POLICY("'none'"))
  })

  it('answers HEAD with the headers and no body', async () => {
    const res = await raw(server, 'HEAD', '/api/sdk/frame/v1?k=pk_test_a')

    expect(res.status).toBe(200)
    expect(res.body).toBe('')
    expect(res.headers['content-security-policy']).toBe(POLICY(`${A} ${B}`))
  })

  it('answers the 404 envelope for a major with no build and for a name that is no major', async () => {
    for (const path of [
      '/api/sdk/frame/v2?k=pk_test_a',
      '/api/sdk/frame/v1x?k=pk_test_a',
      '/api/sdk/frame/1?k=pk_test_a',
      '/api/sdk/frame/..%2fv1?k=pk_test_a',
      '/api/sdk/frame/v1/extra?k=pk_test_a',
      '/api/sdk/frame/?k=pk_test_a',
    ]) {
      expect(isEnvelope404(await raw(server, 'GET', path)), path).toBe(true)
    }
  })

  it('answers the 404 envelope when the build is missing, with the usual security headers', async () => {
    const res = await raw(withoutBuild, 'GET', '/api/sdk/frame/v1?k=pk_test_a')

    expect(isEnvelope404(res)).toBe(true)
    expect(res.headers['content-security-policy']).toContain("default-src 'self'")
    expect(res.headers['cache-control']).not.toBe('no-store')
  })

  it('answers the 404 envelope to a method other than GET and HEAD', async () => {
    expect(isEnvelope404(await raw(server, 'POST', '/api/sdk/frame/v1?k=pk_test_a'))).toBe(true)
  })
})
