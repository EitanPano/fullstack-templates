// sdk-files.ts belongs: the two routes that serve the SDK's built files, both outside the key
// gate: the loader, frame script and frame style under /api/sdk/dist/v<major>/ and the frame
// document at /api/sdk/frame/v<major>. Both answer the 404 envelope, never the single-page shell,
// and neither is in the OpenAPI document; server.ts mounts them.
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { RequestHandler, Response } from 'express'

import { env, isOrigin } from '../config/env'
import { log } from '../services/logger'
import { resolveKey } from '../services/security/sdk-keys'

// What /api/sdk/dist serves: a major's folder and a script or stylesheet in it, nothing else.
// Matching the raw path means an encoded slash or dot, a backslash and a second folder never
// reach the disk, and neither frame.html nor a source map is served.
const DIST_FILE = /^v[0-9]+\/[A-Za-z0-9._-]+\.(js|css)$/
const MAJOR = /^v[0-9]+$/

// A script or link tag sends no header, so the file is readable from any origin; the cache is
// short because one address moves with every release.
const DIST_HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*',
  'X-Content-Type-Options': 'nosniff',
} as const

// The frame may load its own script and style, images from its own origin and from
// SDK_IMG_ORIGINS, and call its own origin, nothing more. The ancestors are the key's origins.
function framePolicy(ancestors: string): string {
  const images = ["'self'", ...env.SDK_IMG_ORIGINS].join(' ')
  return (
    `default-src 'none'; script-src 'self'; style-src 'self'; img-src ${images}; ` +
    `connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors ${ancestors}`
  )
}

// A regular file that is really inside `root`: a link in the build to a file elsewhere is a 404.
async function isServable(root: string, name: string): Promise<boolean> {
  try {
    const real = await realpath(join(root, name))
    const rel = relative(await realpath(root), real)
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) return false
    return (await stat(real)).isFile()
  } catch {
    return false
  }
}

// Headers are set only once the file is known to exist, so a 404 carries none of them; a read
// that still fails takes them off again before the 404 envelope. Express adds the file's weak
// ETag (the application's `etag` setting, whatever this call says) and answers a request that
// holds it with 304.
function send(
  res: Response,
  next: (error?: unknown) => void,
  root: string,
  name: string,
  headers: Readonly<Record<string, string>>,
): void {
  res.set(headers)
  res.sendFile(name, { root, cacheControl: false, lastModified: false }, (error) => {
    if (error === undefined || res.headersSent) return
    for (const header of Object.keys(headers)) res.removeHeader(header)
    next()
  })
}

// The origins that may frame the document, or 'none': a lookup that throws is never read as a
// key, and a record's origin outside the closed form never reaches the header.
async function ancestorsOf(
  key: string | undefined,
  requestId: string | undefined,
): Promise<string> {
  try {
    const record = await resolveKey(key)
    if (record?.enabled !== true || !record.origins.every(isOrigin)) return "'none'"
    return record.origins.join(' ')
  } catch {
    log.warn('sdk key lookup failed', { requestId })
    return "'none'"
  }
}

const isRead = (method: string) => method === 'GET' || method === 'HEAD'

// Mounted at /api/sdk/dist. With no directory it never answers.
export function sdkDist(dir: string | undefined): RequestHandler {
  return (req, res, next) => {
    const name = req.path.slice(1)
    if (dir === undefined || !isRead(req.method) || !DIST_FILE.test(name)) {
      next()
      return
    }
    const root = resolve(dir)
    void isServable(root, name)
      .then((servable) => {
        if (!servable) {
          next()
          return
        }
        res.type(name.endsWith('.css') ? 'css' : 'js')
        send(res, next, root, name, DIST_HEADERS)
      })
      .catch(next)
  }
}

// Mounted at /api/sdk/frame/:version. The one HTML page of the API package: it may be framed by
// the origins the key lists and by nothing else, so helmet's policy and X-Frame-Options give way
// to one policy of ours. An unknown, missing or switched-off key, or a lookup that fails, still
// gets the page, with no ancestor.
export function sdkFrame(dir: string | undefined): RequestHandler {
  return (req, res, next) => {
    const version = req.params.version
    if (
      dir === undefined ||
      !isRead(req.method) ||
      typeof version !== 'string' ||
      !MAJOR.test(version)
    ) {
      next()
      return
    }
    const root = resolve(dir)
    const name = `${version}/frame.html`
    void isServable(root, name)
      .then((servable) => {
        if (!servable) {
          next()
          return
        }
        const key = typeof req.query.k === 'string' ? req.query.k : undefined
        return ancestorsOf(key, res.locals.requestId).then((ancestors) => {
          res.removeHeader('Content-Security-Policy')
          res.removeHeader('X-Frame-Options')
          res.type('html')
          send(res, next, root, name, {
            'Content-Security-Policy': framePolicy(ancestors),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer',
          })
        })
      })
      .catch(next)
  }
}
