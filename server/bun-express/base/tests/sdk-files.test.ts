import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createApp } from '../src/server'
import { isEnvelope404, listen, raw } from './sdk-http'

const LOADER = '(()=>{window.__loader=1})()'
const STYLE = 'body{margin:0}'
const INDEX = '<!doctype html><title>spa</title>'
const BASE = '/api/sdk/dist/v1'

let root: string
let build: string
let server: Server
let withSpa: Server
let withoutBuild: Server

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'sdk-files-'))
  build = join(root, 'cdn')
  const spa = join(root, 'spa')
  mkdirSync(join(build, 'v1', 'folder.js'), { recursive: true })
  mkdirSync(join(build, 'v2'), { recursive: true })
  mkdirSync(spa)
  writeFileSync(join(build, 'v1', 'loader.js'), LOADER)
  writeFileSync(join(build, 'v1', 'frame.js'), 'console.log("frame")')
  writeFileSync(join(build, 'v1', 'frame.html'), '<!doctype html><title>frame</title>')
  writeFileSync(join(build, 'v1', 'frame.css'), STYLE)
  writeFileSync(join(build, 'v1', 'frame.css.map'), '{}')
  writeFileSync(join(build, 'v1', 'frame.CSS'), STYLE)
  writeFileSync(join(build, 'v1', 'notes.txt'), 'not a script')
  writeFileSync(join(build, 'v1', 'map.js.map'), '{}')
  writeFileSync(join(build, 'v2', 'loader.js'), 'two')
  writeFileSync(join(root, 'canary.js'), 'CANARY')
  writeFileSync(join(spa, 'index.html'), INDEX)
  // A link inside the build to a folder outside it: the name is allowed, the target is not. A
  // junction needs no privilege on Windows; elsewhere the type is ignored.
  mkdirSync(join(root, 'outside'))
  writeFileSync(join(root, 'outside', 'leak.js'), 'CANARY')
  symlinkSync(join(root, 'outside'), join(build, 'v3'), 'junction')
  server = await listen(createApp(undefined, build))
  withSpa = await listen(createApp(spa, build))
  withoutBuild = await listen(createApp(spa, undefined))
})

afterAll(() => {
  server.close()
  withSpa.close()
  withoutBuild.close()
  rmSync(root, { recursive: true, force: true })
})

describe('GET and HEAD /api/sdk/dist/v<major>/<file>', () => {
  it('serves the loader with the cross-origin headers and a short cache', async () => {
    const res = await raw(server, 'GET', `${BASE}/loader.js`)

    expect(res.status).toBe(200)
    expect(res.body).toBe(LOADER)
    expect(res.headers['content-type']).toMatch(/^(text|application)\/javascript/)
    expect(res.headers['cache-control']).toBe('public, max-age=300')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
    expect(res.headers['x-request-id']).toBeTruthy()
  })

  it('names a validator, and answers 304 with no body to a request that holds it', async () => {
    const first = await raw(server, 'GET', `${BASE}/loader.js`)
    const etag = first.headers.etag ?? ''
    const again = await raw(server, 'GET', `${BASE}/loader.js`, { 'If-None-Match': etag })

    expect(etag).toMatch(/^(W\/)?".+"$/)
    expect(again.status).toBe(304)
    expect(again.body).toBe('')
    expect(again.headers['cache-control']).toBe('public, max-age=300')
    expect(again.headers['access-control-allow-origin']).toBe('*')
  })

  it('sends the file to a request that holds another validator', async () => {
    const res = await raw(server, 'GET', `${BASE}/loader.js`, { 'If-None-Match': '"other"' })

    expect(res.status).toBe(200)
    expect(res.body).toBe(LOADER)
  })

  it('serves a request that carries no key and no Origin, as a script tag does', async () => {
    const res = await raw(server, 'GET', `${BASE}/frame.js`)

    expect(res.status).toBe(200)
  })

  it('answers HEAD with the same headers and no body', async () => {
    const res = await raw(server, 'HEAD', `${BASE}/loader.js`)

    expect(res.status).toBe(200)
    expect(res.body).toBe('')
    expect(res.headers['cache-control']).toBe('public, max-age=300')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['content-type']).toMatch(/javascript/)
  })

  it('serves a stylesheet with its type, the same headers, a validator and 304', async () => {
    const res = await raw(server, 'GET', `${BASE}/frame.css`)
    const etag = res.headers.etag ?? ''
    const again = await raw(server, 'GET', `${BASE}/frame.css`, { 'If-None-Match': etag })

    expect(res.status).toBe(200)
    expect(res.body).toBe(STYLE)
    expect(res.headers['content-type']).toBe('text/css; charset=utf-8')
    expect(res.headers['cache-control']).toBe('public, max-age=300')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(etag).toMatch(/^(W\/)?".+"$/)
    expect(again.status).toBe(304)
    expect(again.body).toBe('')
  })

  it('answers HEAD for a stylesheet with its headers and no body', async () => {
    const res = await raw(server, 'HEAD', `${BASE}/frame.css`)

    expect(res.status).toBe(200)
    expect(res.body).toBe('')
    expect(res.headers['content-type']).toBe('text/css; charset=utf-8')
  })

  it('serves a script as a script, as before', async () => {
    const res = await raw(server, 'GET', `${BASE}/loader.js`)

    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8')
  })

  it('answers the 404 envelope for a source map and an upper-case extension', async () => {
    for (const path of [`${BASE}/frame.css.map`, `${BASE}/frame.CSS`]) {
      expect(isEnvelope404(await raw(server, 'GET', path)), path).toBe(true)
    }
  })

  it('serves another major from its own folder', async () => {
    const res = await raw(server, 'GET', '/api/sdk/dist/v2/loader.js')

    expect(res.status).toBe(200)
    expect(res.body).toBe('two')
  })

  it('answers the 404 envelope for frame.html: the frame document has its own route', async () => {
    expect(isEnvelope404(await raw(server, 'GET', `${BASE}/frame.html`))).toBe(true)
  })

  it('answers the 404 envelope for a name outside the allow-list', async () => {
    for (const path of [
      `${BASE}/notes.txt`,
      `${BASE}/map.js.map`,
      `${BASE}/loader.JS`,
      `${BASE}/.hidden.js`,
      '/api/sdk/dist/loader.js',
      '/api/sdk/dist/v/loader.js',
      '/api/sdk/dist/vx/loader.js',
      '/api/sdk/dist/v1/sub/loader.js',
      '/api/sdk/dist/v1/',
      '/api/sdk/dist/',
      '/api/sdk/dist',
    ]) {
      const res = await raw(server, 'GET', path)

      expect(isEnvelope404(res), path).toBe(true)
    }
  })

  it('answers the 404 envelope for a directory, even one named like a script', async () => {
    expect(isEnvelope404(await raw(server, 'GET', `${BASE}/folder.js`))).toBe(true)
  })

  it('answers the 404 envelope for a missing file and a missing major', async () => {
    expect(isEnvelope404(await raw(server, 'GET', `${BASE}/missing.js`))).toBe(true)
    expect(isEnvelope404(await raw(server, 'GET', '/api/sdk/dist/v9/loader.js'))).toBe(true)
  })

  it('carries none of the file headers on a 404', async () => {
    const res = await raw(server, 'GET', `${BASE}/missing.js`)

    expect(res.headers['cache-control'] ?? '').not.toContain('max-age=300')
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('refuses traversal in every spelling', async () => {
    for (const path of [
      '/api/sdk/dist/v1/../../canary.js',
      '/api/sdk/dist/v1/..%2f..%2fcanary.js',
      '/api/sdk/dist/v1/%2e%2e/%2e%2e/canary.js',
      '/api/sdk/dist/v1/%2E%2E%2Fcanary.js',
      '/api/sdk/dist/..%2fcanary.js',
      '/api/sdk/dist/v1/..\\..\\canary.js',
      '/api/sdk/dist/v1/%5c..%5ccanary.js',
      '/api/sdk/dist/v1%2floader.js',
      '/api/sdk/dist/v1/loader.js%00',
      '/api/sdk/dist/v1/loader%2ejs',
      '/api/sdk/dist/v1/%2e%2e%2f%2e%2e%2fcanary.js',
    ]) {
      const res = await raw(server, 'GET', path)

      expect(res.body, path).not.toContain('CANARY')
      expect(res.status, path).toBe(404)
    }
  })

  it('does not follow a link out of the build', async () => {
    const res = await raw(server, 'GET', '/api/sdk/dist/v3/leak.js')

    expect(res.body).not.toContain('CANARY')
    expect(res.status).toBe(404)
  })

  it('answers the 404 envelope to a method other than GET and HEAD', async () => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      expect(isEnvelope404(await raw(server, method, `${BASE}/loader.js`))).toBe(true)
    }
  })

  it('answers the 404 envelope for both routes while SDK_DIR is unset', async () => {
    expect(isEnvelope404(await raw(withoutBuild, 'GET', `${BASE}/loader.js`))).toBe(true)
    expect(isEnvelope404(await raw(withoutBuild, 'GET', '/api/sdk/frame/v1?k=pk_x'))).toBe(true)
  })

  it('never falls back to the single-page shell, with STATIC_DIR set', async () => {
    for (const path of [`${BASE}/missing.js`, `${BASE}/frame.html`, '/api/sdk/dist/v1/x']) {
      const res = await raw(withSpa, 'GET', path)

      expect(isEnvelope404(res), path).toBe(true)
      expect(res.body).not.toContain('<title>spa</title>')
    }
  })

  it('still serves the shell for a page path beside it', async () => {
    const res = await raw(withSpa, 'GET', '/some/page')

    expect(res.status).toBe(200)
    expect(res.body).toBe(INDEX)
  })
})
