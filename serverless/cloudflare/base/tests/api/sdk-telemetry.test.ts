// POST /api/sdk/v1/telemetry: the frame's events, behind the frame-only guard. The sink is
// replaced by a spy; a sink that throws must not change the answer, since the frame sends on page
// hide and reads none. The body cap of the namespace is proved here too.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SDK_MAX_BODY_BYTES } from '../../server/config/constants'
import * as telemetry from '../../server/services/telemetry'
import { json, served } from './helpers'
import { A, KEY_A, sdkBindings } from './sdk-assets'

let sink: ReturnType<typeof spyOnSink>
const spyOnSink = () => vi.spyOn(telemetry, 'recordSdkTelemetry')

beforeEach(() => {
  sink = spyOnSink().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const PATH = '/api/sdk/v1/telemetry'
const frame = { 'Sec-Fetch-Site': 'same-origin', 'X-Sdk-Key': KEY_A }
const event = { name: 'fixture', n: 1 }
const events = (count: number) => Array.from({ length: count }, () => event)

const post = (body: unknown, headers: Record<string, string> = frame, bindings = sdkBindings()) =>
  served(PATH, { method: 'POST', body, headers, bindings })

type ErrorBody = { error: { code: string } }

describe('POST /api/sdk/v1/telemetry', () => {
  it('answers 204 with no body for 1 and for 100 events', async () => {
    for (const count of [1, 100]) {
      const res = await post({ events: events(count) })

      expect(res.status, String(count)).toBe(204)
      expect(await res.text()).toBe('')
    }
  })

  it('hands { key, events } to the sink', async () => {
    await post({ events: [event, { name: 'other' }] })

    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink.mock.calls[0]?.[0]).toEqual({
      key: KEY_A,
      events: [event, { name: 'other' }],
    })
  })

  it('awaits the sink before it answers 204', async () => {
    let release: () => void = () => undefined
    sink.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    let answered = false

    const pending = post({ events: [event] }).then((res) => {
      answered = true
      return res
    })
    await vi.waitFor(() => expect(sink).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(answered).toBe(false)
    release()

    expect((await pending).status).toBe(204)
  })

  it('still answers 204 when the sink throws, and logs the error class alone', async () => {
    sink.mockRejectedValue(new TypeError('fixture-sink-text'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const res = await post({ events: [{ secret: 'fixture-secret' }] })

    const lines = warn.mock.calls.map((call) => String(call[0]))
    warn.mockRestore()
    expect(res.status).toBe(204)
    const line = lines.find((text) => text.includes('"level":"warn"')) ?? ''
    expect(line).toContain('"error":"TypeError"')
    expect(line).toContain('"requestId"')
    expect(lines.join('')).not.toContain('fixture-sink-text')
    expect(lines.join('')).not.toContain('fixture-secret')
    expect(lines.join('')).not.toContain('stack')
  })

  it('also survives a sink that throws before it returns a promise', async () => {
    sink.mockImplementation(() => {
      throw new Error('sink is down')
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const res = await post({ events: [event] })

    expect(res.status).toBe(204)
    vi.restoreAllMocks()
  })

  it('refuses a request from a listed origin with 403 and no allow-origin header', async () => {
    const res = await post({ events: [event] }, { Origin: A, 'X-Sdk-Key': KEY_A })

    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(sink).not.toHaveBeenCalled()
  })

  it('refuses a same-origin request with no key or an unknown key', async () => {
    const bare = await post({ events: [event] }, { 'Sec-Fetch-Site': 'same-origin' })
    const unknown = await post(
      { events: [event] },
      { 'Sec-Fetch-Site': 'same-origin', 'X-Sdk-Key': 'pk_unknown' },
    )

    expect(bare.status).toBe(403)
    expect(unknown.status).toBe(403)
  })

  it('answers a preflight with no allow header', async () => {
    const res = await served(PATH, {
      method: 'OPTIONS',
      headers: { Origin: A, 'Access-Control-Request-Method': 'POST' },
      bindings: sdkBindings(),
    })

    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
    expect(res.headers.get('access-control-allow-methods')).toBeNull()
  })

  it('answers 405 with Allow to another method, once the gate admits it', async () => {
    const res = await served(PATH, { headers: frame, bindings: sdkBindings() })

    expect(res.status).toBe(405)
    expect(res.headers.get('allow')).toBe('POST')
  })

  const INVALID: Record<string, unknown> = {
    'no events': { events: [] },
    '101 events': { events: events(101) },
    'a body that is no object': [event],
    'events that is no array': { events: event },
    'a missing events field': {},
    'an item that is a string': { events: ['x'] },
    'an item that is null': { events: [null] },
    'an item that is an array': { events: [[1]] },
    'an item that is a number among objects': { events: [event, 3] },
  }

  for (const [name, body] of Object.entries(INVALID)) {
    it(`answers the validation error for ${name}`, async () => {
      const res = await post(body)

      expect(res.status).toBe(400)
      expect((await json<ErrorBody>(res)).error.code).toBe('validation_failed')
      expect(sink).not.toHaveBeenCalled()
    })
  }
})

describe('the body cap of the namespace', () => {
  const padded = (bytes: number) => JSON.stringify({ events: [{ pad: 'x'.repeat(bytes) }] })

  it('is 65,536 bytes', () => {
    expect(SDK_MAX_BODY_BYTES).toBe(65_536)
  })

  it('answers 413 for a body over the cap after a valid key', async () => {
    const res = await post(padded(SDK_MAX_BODY_BYTES))

    expect(res.status).toBe(413)
    expect((await json<ErrorBody>(res)).error.code).toBe('payload_too_large')
  })

  it('answers 413 on a declared length over the cap without reading the body', async () => {
    const res = await post(padded(10), {
      ...frame,
      'Content-Length': String(SDK_MAX_BODY_BYTES + 1),
    })

    expect(res.status).toBe(413)
  })

  it('accepts a body just under the cap', async () => {
    const res = await post(padded(SDK_MAX_BODY_BYTES - 100))

    expect(res.status).toBe(204)
  })

  it('answers 403, never 413, without a valid key', async () => {
    const huge = padded(SDK_MAX_BODY_BYTES * 2)

    const bare = await post(huge, { 'Sec-Fetch-Site': 'same-origin' })
    const unknown = await post(huge, { ...frame, 'X-Sdk-Key': 'pk_unknown' })
    const listed = await post(huge, { Origin: A, 'X-Sdk-Key': KEY_A })

    expect([bare.status, unknown.status, listed.status]).toEqual([403, 403, 403])
  })

  it('answers 403, never 413, to a cross-origin oversize body', async () => {
    const res = await post(padded(SDK_MAX_BODY_BYTES * 2), { Origin: A, 'X-Sdk-Key': KEY_A })

    expect(res.status).toBe(403)
    expect(sink).not.toHaveBeenCalled()
  })

  it('answers 403, never 400, to a cross-origin malformed body', async () => {
    const res = await post('{ not json', { Origin: A, 'X-Sdk-Key': KEY_A })

    expect(res.status).toBe(403)
    expect(sink).not.toHaveBeenCalled()
  })

  it('answers 403 to a keyless body declared over the server-wide limit', async () => {
    const res = await post(padded(10), {
      'Sec-Fetch-Site': 'same-origin',
      'Content-Length': String(2 * 1_048_576),
    })

    expect(res.status).toBe(403)
  })

  it('leaves the limit of a path outside the namespace as it was', async () => {
    const over = { name: 'x'.repeat(SDK_MAX_BODY_BYTES + 10) }
    const mid = await served('/api/entity', { method: 'POST', body: over })
    const huge = await served('/api/entity', {
      method: 'POST',
      body: { name: 'x'.repeat(1_048_576 + 10) },
    })

    expect(mid.status).not.toBe(413)
    expect(huge.status).toBe(413)
  })
})
