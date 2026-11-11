// @server-start
// A dependency-free static server for the e2e suite: it serves `dist/` the way the nginx image does
// (an extension-less path is the SPA shell, a missing file with an extension is a 404, a dotfile
// or a traversal is refused) and forwards /api to the API, so the page and the API share one
// origin. It is the counterpart of `vite preview`; Playwright starts it after `bun run build`.
//
// PORT is the listening port (0 picks a free one), API_URL the API's origin, DIST_DIR the folder to
// serve (default: dist beside this script's folder). E2E_STATIC_LOG=1 logs one line per request.
// @server-end
// @noserver-start
// A dependency-free static server for the e2e suite: it serves `dist/` the way the nginx image does
// (an extension-less path is the SPA shell, a missing file with an extension is a 404, a dotfile
// or a traversal is refused). It is the counterpart of `vite preview`; Playwright starts it after
// `bun run build`.
//
// PORT is the listening port (0 picks a free one), DIST_DIR the folder to serve (default: dist
// beside this script's folder). E2E_STATIC_LOG=1 logs one line per request.
// @noserver-end
import { createReadStream, realpathSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

// The file a request path names under root, or null when it is refused: an undecodable path, a
// backslash, a NUL, a dotfile or any dot segment (so no traversal) and a path that leaves root.
function fileFor(root, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\\') || decoded.includes('\0')) return null
  const segments = decoded.split('/').filter(Boolean)
  if (segments.some((segment) => segment.startsWith('.'))) return null
  const file = resolve(join(root, ...segments))
  return file === root || file.startsWith(root + sep) ? file : null
}

function plain(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-cache',
  })
  res.end(text)
}

function serveFile(req, res, file, size) {
  res.writeHead(200, {
    'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(file)
    .on('error', () => res.destroy())
    .pipe(res)
}

// @server-start
// Streams the request to the API and the answer back: method, headers, body and cookies pass
// through unchanged, and the client address is appended to x-forwarded-for.
function proxy(req, res, target) {
  const headers = { ...req.headers }
  delete headers.connection
  const peer = req.socket.remoteAddress ?? ''
  headers['x-forwarded-for'] = [req.headers['x-forwarded-for'], peer].filter(Boolean).join(', ')
  headers['x-forwarded-proto'] = 'http'
  const upstream = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: req.url,
      method: req.method,
      headers,
    },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, answer.statusMessage, answer.rawHeaders)
      answer.pipe(res)
    },
  )
  upstream.on('error', () => {
    if (res.headersSent) res.destroy()
    else plain(res, 502, 'Bad gateway')
  })
  res.on('close', () => upstream.destroy())
  req.pipe(upstream)
}
// @server-end

// @server-start
export function createStaticServer({ root, apiUrl, log = false }) {
  const base = resolve(root)
  const target = new URL(apiUrl)
// @server-end
// @noserver-start
export function createStaticServer({ root, log = false }) {
  const base = resolve(root)
// @noserver-end
  const handle = async (req, res) => {
    if (log) res.on('finish', () => console.log(`${req.method} ${req.url} ${res.statusCode}`))
    // A target such as // or /// is not a valid URL path for the parser: a client fault, not a crash.
    let pathname
    try {
      pathname = new URL(req.url ?? '/', 'http://localhost').pathname
    } catch {
      plain(res, 400, 'Bad request')
      return
    }

    // @server-start
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      proxy(req, res, target)
      return
    }
    // @server-end
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      plain(res, 405, 'Method not allowed')
      return
    }
    const wanted = fileFor(base, pathname)
    if (!wanted) {
      plain(res, 404, 'Not found')
      return
    }
    // The static folders are not listings and not routes (as in the nginx config).
    if (/^\/(media|icons|i18n)\/$/.test(pathname)) {
      plain(res, 404, 'Not found')
      return
    }
    // A path with an extension is a file or a 404; any other path is a client route.
    const isAsset = extname(pathname) !== ''
    const file = isAsset ? wanted : join(base, 'index.html')
    try {
      const info = await stat(file)
      if (!info.isFile()) throw new Error('not a file')
      serveFile(req, res, file, info.size)
    } catch {
      plain(res, 404, 'Not found')
    }
  }
  // Whatever a handler throws answers 500 and is logged; it never takes the server down.
  return http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(`e2e static server: ${req.method} ${req.url}`, error)
      if (res.headersSent) res.destroy()
      else plain(res, 500, 'Internal error')
    })
  })
}

const here = fileURLToPath(import.meta.url)
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(here)) {
  const port = Number(process.env.PORT ?? '__PORT__')
  const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:__SERVER_PORT__' // @server
  const root = process.env.DIST_DIR ?? join(dirname(here), '..', 'dist')
  const server = createStaticServer({ root, apiUrl, log: Boolean(process.env.E2E_STATIC_LOG) }) // @server
  const server = createStaticServer({ root, log: Boolean(process.env.E2E_STATIC_LOG) }) // @noserver
  server.listen(port, '127.0.0.1', () => {
    const address = server.address()
    const listening = typeof address === 'object' && address ? address.port : port
    console.log(`e2e static server on http://127.0.0.1:${String(listening)} (api ${apiUrl})`) // @server
    console.log(`e2e static server on http://127.0.0.1:${String(listening)}`) // @noserver
  })
}
