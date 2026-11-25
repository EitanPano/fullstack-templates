import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import request from 'supertest'

import { env } from '../src/config/env'
import { SDK_MAX_BODY_BYTES } from '../src/config/constants'
import { memory } from '../src/infra/memory'
import { app } from '../src/server'
import * as sdkKeys from '../src/services/security/sdk-keys'
import * as telemetry from '../src/services/telemetry'

const KEY = 'pk_test_a'
const A = 'https://a.example.test'
const PATH = '/api/sdk/v1/telemetry'

type ErrorBody = { error: { code: string }; requestId: string }

const original = env.SDK_KEYS

beforeEach(async () => {
  env.SDK_KEYS = new Map([[KEY, [A]]])
  // The rate limits count in the cache; these suites keep no records, so the store is left alone.
  await memory.close()
})

afterEach(() => {
  env.SDK_KEYS = original
})

// What the frame sends: same origin, with the key.
const fromFrame = () =>
  request(app).post(PATH).set('Sec-Fetch-Site', 'same-origin').set('X-Sdk-Key', KEY)

const events = (count: number) => Array.from({ length: count }, (_, index) => ({ n: index }))

function expectEnvelope(res: request.Response, status: number, code: string): void {
  const body = res.body as ErrorBody

  expect(res.status).toBe(status)
  expect(body.error.code).toBe(code)
  expect(body.requestId).toBeTruthy()
}

describe('POST /api/sdk/v1/telemetry', () => {
  it('answers 204 with no body for 1 and for 100 events', async () => {
    for (const count of [1, 100]) {
      const res = await fromFrame().send({ events: events(count) })

      expect(res.status, String(count)).toBe(204)
      expect(res.text).toBe('')
    }
  })

  it('hands the key and the events to the sink', async () => {
    const sink = spyOn(telemetry, 'recordSdkTelemetry').mockResolvedValue()

    try {
      const sent = [{ name: 'shown' }, { name: 'closed', data: { ms: 5 } }]
      const res = await fromFrame().send({ events: sent })

      expect(res.status).toBe(204)
      expect(sink).toHaveBeenCalledTimes(1)
      expect(sink).toHaveBeenCalledWith({ key: KEY, events: sent })
    } finally {
      sink.mockRestore()
    }
  })

  it('still answers 204 when the sink throws, and logs a warning without the events', async () => {
    const sink = spyOn(telemetry, 'recordSdkTelemetry').mockRejectedValue(new Error('sink down'))
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const res = await fromFrame().send({ events: [{ secret: 'payload-text' }] })

      expect(res.status).toBe(204)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('payload-text')
    } finally {
      sink.mockRestore()
      warn.mockRestore()
    }
  })

  it('awaits the sink before it answers 204', async () => {
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const sink = spyOn(telemetry, 'recordSdkTelemetry').mockReturnValue(held)

    try {
      let answered = false
      const pending = fromFrame()
        .send({ events: events(1) })
        .then((res) => {
          answered = true
          return res
        })
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(sink).toHaveBeenCalledTimes(1)
      expect(answered).toBe(false)
      release()
      expect((await pending).status).toBe(204)
    } finally {
      release()
      sink.mockRestore()
    }
  })

  it('logs a failing sink by its error class only, with the request id', async () => {
    const sink = spyOn(telemetry, 'recordSdkTelemetry').mockImplementation(() => {
      throw new TypeError('fixture-sink-text')
    })
    const warn = spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const res = await fromFrame().send({ events: [{ note: 'fixture-event-text' }] })
      const line = String(warn.mock.calls[0]?.[0])

      expect(res.status).toBe(204)
      expect(line).toContain('TypeError')
      expect(line).toContain(String(res.header['x-request-id']))
      expect(line).not.toContain('fixture-sink-text')
      expect(line).not.toContain('fixture-event-text')
      expect(line).not.toContain('stack')
    } finally {
      sink.mockRestore()
      warn.mockRestore()
    }
  })

  it('refuses a listed cross-origin request with 403 and no allow-origin header', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Origin', A)
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-Sdk-Key', KEY)
      .send({ events: events(1) })

    expectEnvelope(res, 403, 'forbidden')
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('refuses a missing key and a disabled key with 403', async () => {
    const bare = await request(app)
      .post(PATH)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ events: events(1) })
    const resolve = spyOn(sdkKeys, 'resolveKey').mockResolvedValue({ origins: [A], enabled: false })

    try {
      const disabled = await fromFrame().send({ events: events(1) })

      expectEnvelope(bare, 403, 'forbidden')
      expectEnvelope(disabled, 403, 'forbidden')
    } finally {
      resolve.mockRestore()
    }
  })

  it('answers the validation error for no events, 101 events, a non-array and a non-object item', async () => {
    const bodies = [
      { events: [] },
      { events: events(101) },
      { events: 'shown' },
      { events: { n: 1 } },
      { events: [1] },
      { events: [null] },
      { events: [[]] },
      { events: ['shown'] },
      {},
    ]

    for (const body of bodies) {
      const res = await fromFrame().send(body)

      expectEnvelope(res, 400, 'validation_failed')
    }
  })

  it('answers 413 for a body over the namespace cap', async () => {
    const big = { events: [{ text: 'x'.repeat(SDK_MAX_BODY_BYTES) }] }

    const res = await fromFrame().send(big)

    expectEnvelope(res, 413, 'payload_too_large')
  })

  it('answers a preflight with no allow header', async () => {
    const res = await request(app)
      .options(PATH)
      .set('Origin', A)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-sdk-key, content-type')

    expect(res.status).toBe(204)
    expect(res.header['access-control-allow-origin']).toBeUndefined()
    expect(res.header['access-control-allow-headers']).toBeUndefined()
  })
})

describe('the body cap of /api/sdk/v1', () => {
  const over = { events: [{ text: 'x'.repeat(SDK_MAX_BODY_BYTES + 1) }] }

  it('answers 403, never 413, to an oversize body without a valid key', async () => {
    const none = await request(app).post(PATH).set('Sec-Fetch-Site', 'same-origin').send(over)
    const unknown = await request(app)
      .post(PATH)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Sdk-Key', 'pk_unknown')
      .send(over)

    expectEnvelope(none, 403, 'forbidden')
    expectEnvelope(unknown, 403, 'forbidden')
  })

  const crossOrigin = () =>
    request(app)
      .post(PATH)
      .set('Origin', A)
      .set('Sec-Fetch-Site', 'cross-site')
      .set('X-Sdk-Key', KEY)

  it('answers 403 to a cross-origin oversize body on telemetry', async () => {
    const res = await crossOrigin().send(over)

    expectEnvelope(res, 403, 'forbidden')
    expect(res.header['access-control-allow-origin']).toBeUndefined()
  })

  it('answers 403 to a cross-origin malformed body on telemetry', async () => {
    const res = await crossOrigin().set('Content-Type', 'application/json').send('{"events": [')

    expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 403 to a keyless body over the server-wide limit', async () => {
    const res = await request(app)
      .post(PATH)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ text: 'x'.repeat(1024 * 1024 + 1) })

    expectEnvelope(res, 403, 'forbidden')
  })

  it('answers 413 to an oversize body after a valid key, on any path of the namespace', async () => {
    const res = await request(app)
      .post('/api/sdk/v1/elsewhere')
      .set('Origin', A)
      .set('X-Sdk-Key', KEY)
      .send(over)

    expectEnvelope(res, 413, 'payload_too_large')
  })

  it("keeps the template's own limit outside the namespace", async () => {
    const mid = await request(app)
      .post('/api/entity')
      .send({ text: 'x'.repeat(SDK_MAX_BODY_BYTES * 2) })
    const huge = await request(app)
      .post('/api/entity')
      .send({ text: 'x'.repeat(1024 * 1024 + 1) })

    expect(mid.status).not.toBe(413)
    expectEnvelope(huge, 413, 'payload_too_large')
  })
})
