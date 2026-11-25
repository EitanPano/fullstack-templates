// A raw HTTP probe for the SDK file routes: the request path reaches the server byte for byte,
// where a client library may normalise `..` or `%2e` before sending. Used by sdk-files.test.ts
// and sdk-frame.test.ts.
import type { Express } from 'express'
import type { IncomingHttpHeaders, Server } from 'node:http'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'

export type Reply = {
  status: number
  headers: IncomingHttpHeaders
  rawHeaders: string[]
  body: string
}

export function listen(app: Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve(server)
    })
  })
}

export function raw(
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
          rawHeaders: res.rawHeaders,
          body: Buffer.concat(chunks).toString(),
        })
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// How many times a header name appears on the response, in any letter case.
export function headerCount(reply: Reply, name: string): number {
  return reply.rawHeaders.filter(
    (entry, index) => index % 2 === 0 && entry.toLowerCase() === name.toLowerCase(),
  ).length
}

// The 404 envelope, and nothing of a page or a file.
export function isEnvelope404(reply: Reply): boolean {
  if (reply.status !== 404) return false
  if (!(reply.headers['content-type'] ?? '').includes('application/json')) return false
  const body = JSON.parse(reply.body) as { error?: { code?: string }; requestId?: string }
  return body.error?.code === 'not_found' && Boolean(body.requestId)
}
