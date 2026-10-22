import { describe, expect, it } from 'bun:test'
import express from 'express'
import request from 'supertest'

import { createLogger } from '../src/services/logger'
import { requestId } from '../src/middleware/request-id'
import { createRequestLog } from '../src/middleware/request-log'

describe('the request log', () => {
  it('writes one line per finished request: method, path, status, duration, request id', async () => {
    const lines: string[] = []
    const logger = createLogger({
      quiet: false,
      sink: {
        info: (line: string) => lines.push(line),
        warn: () => undefined,
        error: () => undefined,
      },
    })
    const app = express()
    app.use(requestId)
    app.use(createRequestLog(logger))
    app.get('/thing', (_req, res) => {
      res.status(204).end()
    })

    const res = await request(app).get('/thing').set('x-request-id', 'trace-1234567890')
    // `finish` fires once the response left the socket; give the event loop one turn.
    await new Promise((resolve) => setImmediate(resolve))

    expect(res.status).toBe(204)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^GET \/thing 204 \d+ms requestId=trace-1234567890$/)
  })

  it('leaves the query string out of the line', async () => {
    const lines: string[] = []
    const logger = createLogger({
      quiet: false,
      sink: {
        info: (line: string) => lines.push(line),
        warn: () => undefined,
        error: () => undefined,
      },
    })
    const app = express()
    app.use(createRequestLog(logger))
    app.get('/thing', (_req, res) => {
      res.status(204).end()
    })

    await request(app).get('/thing?token=secret&email=a@b.co')
    await new Promise((resolve) => setImmediate(resolve))

    expect(lines[0]).toMatch(/^GET \/thing 204 /)
    expect(lines.join(' ')).not.toContain('secret')
  })
})
