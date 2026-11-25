// `bun run dev`: rebuilds the CDN files on change and serves a host page on __PORT__ under the
// policy an integrator would write (`img-src 'self'` lets the favicon request pass, so the console
// shows only the SDK's lines). The page loads the loader from the API (`bun run dev` of the server
// serves dist/cdn), with the dev key the server's local default lists.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'

const root = process.cwd()
const api = 'http://localhost:__SERVER_PORT__'
const policy = `default-src 'none'; script-src 'self' ${api}; connect-src ${api}; frame-src ${api}; img-src 'self'`
const major = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version.split('.')[0]

const bin = join(root, 'node_modules', '.bin', 'tsdown')
const build = spawn(`"${bin}" --watch`, { cwd: root, stdio: 'inherit', shell: true })

const server = createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/index.html') {
    response.writeHead(404).end()
    return
  }
  const page = readFileSync(join(root, 'playground', 'index.html'), 'utf8').replace(
    '{{major}}',
    major,
  )
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': policy,
  })
  response.end(page)
})
server.listen(__PORT__, '127.0.0.1', () =>
  console.log(`playground: http://localhost:__PORT__ (API ${api})`),
)

const stop = () => {
  build.kill()
  server.close()
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
