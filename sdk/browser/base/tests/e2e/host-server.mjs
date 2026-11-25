// A host page's server for the e2e: `node host-server.mjs <port> <api origin> <listed origin> <key>`.
// It serves tests/e2e/pages/ under the policy an integrator would write: no inline script, no
// style, and the API's origin for scripts, connections and frames. The page's own favicon is let
// through (`img-src 'self'`): Firefox checks it against the policy, and the page's own violation
// would hide the SDK's. A page that frames another host adds that host's origin to `frame-src`.
// It also serves `/image.png` from every host: the e2e uses the unlisted host's copy to show the
// frame's policy refuses an image origin it does not list.
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// An 8 by 8 red square: a real picture, so a policy that failed to refuse it would show.
const IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4ISeHFTEMLQkAkL9BAbKfPiIAAAAASUVORK5CYII=',
  'base64',
)

const [port, api, listed, key] = process.argv.slice(2)
if (!port || !api || !listed || !key) {
  console.error('usage: node host-server.mjs <port> <api origin> <listed origin> <key>')
  process.exit(2)
}

const here = dirname(fileURLToPath(import.meta.url))
const pages = join(here, 'pages')
const major = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8')).version.split(
  '.',
)[0]
const policy = (frames) =>
  `default-src 'none'; script-src 'self' ${api}; connect-src ${api}; frame-src ${frames}; img-src 'self'`

createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://host.test').pathname
  if (path === '/favicon.ico') return void response.writeHead(204).end()
  if (path === '/image.png') {
    response.writeHead(200, { 'content-type': 'image/png' })
    return void response.end(IMAGE)
  }
  // The shipped loader, from the package's own build: the API serves the test build instead.
  if (path === '/shipped/loader.js') {
    try {
      const file = join(here, '../../dist/cdn', `v${major}`, 'loader.js')
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      return void response.end(await readFile(file))
    } catch {
      return void response.writeHead(404).end()
    }
  }
  const name = path === '/' ? 'blank.html' : path.slice(1)
  if (!/^[a-z-]+\.(html|js)$/.test(name)) return void response.writeHead(404).end()
  try {
    const body = (await readFile(join(pages, name), 'utf8'))
      .replaceAll('{{api}}', api)
      .replaceAll('{{listed}}', listed)
      .replaceAll('{{key}}', key)
      .replaceAll('{{major}}', major)
    if (name.endsWith('.js')) {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
      return void response.end(body)
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': policy(name.startsWith('nested') ? `${api} ${listed}` : api),
    })
    response.end(body)
  } catch {
    response.writeHead(404).end()
  }
}).listen(Number(port), '127.0.0.1')
