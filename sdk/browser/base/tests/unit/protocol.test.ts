import { describe, expect, it } from 'vitest'

import {
  DATA_MAX_BYTES,
  HANDSHAKE_KIND,
  PROPS_MAX_BYTES,
  PROTOCOL_VERSION,
  checkJson,
  checkJsonObject,
  isHandshake,
  isHttpsUrl,
  parseFrameMessage,
  parseHostMessage,
  parseTheme,
  themeFromParams,
  themeToParams,
} from '../../src/protocol'

const v = PROTOCOL_VERSION

describe('handshake guard', () => {
  it('accepts the handshake of this version', () => {
    expect(isHandshake({ kind: HANDSHAKE_KIND, v })).toBe(true)
  })

  it.each([
    null,
    'x',
    {},
    { kind: HANDSHAKE_KIND },
    { kind: 'other', v },
    { kind: HANDSHAKE_KIND, v: 99 },
  ])('refuses %j', (data) => {
    expect(isHandshake(data)).toBe(false)
  })
})

describe('frame message guard', () => {
  it('accepts ready, size, rendered, error, emit and close messages', () => {
    expect(parseFrameMessage({ v, type: 'ready' })).toEqual({ v, type: 'ready' })
    expect(parseFrameMessage({ v, type: 'size', height: 120.5 })).toEqual({
      v,
      type: 'size',
      height: 120.5,
    })
    expect(parseFrameMessage({ v, type: 'rendered' })).toEqual({ v, type: 'rendered' })
    expect(parseFrameMessage({ v, type: 'close' })).toEqual({ v, type: 'close' })
    expect(parseFrameMessage({ v, type: 'error', code: 'bad_props' })).toEqual({
      v,
      type: 'error',
      code: 'bad_props',
    })
    expect(parseFrameMessage({ v, type: 'emit', name: 'seen', data: { a: [1] } })).toEqual({
      v,
      type: 'emit',
      name: 'seen',
      data: { a: [1] },
    })
    expect(parseFrameMessage({ v, type: 'emit', name: 'seen' })).toEqual({
      v,
      type: 'emit',
      name: 'seen',
    })
  })

  it('accepts the ack of a consent message, and refuses one with no state', () => {
    expect(parseFrameMessage({ v, type: 'ack', state: 'denied' })).toEqual({
      v,
      type: 'ack',
      state: 'denied',
    })
    expect(parseFrameMessage({ v, type: 'ack', state: 'granted' })).toEqual({
      v,
      type: 'ack',
      state: 'granted',
    })
    expect(parseFrameMessage({ v, type: 'ack' })).toBeNull()
    expect(parseFrameMessage({ v, type: 'ack', state: 'maybe' })).toBeNull()
  })

  it('replaces an error code that is not a code with module_failed', () => {
    expect(parseFrameMessage({ v, type: 'error', code: 'Free text with spaces' })).toEqual({
      v,
      type: 'error',
      code: 'module_failed',
    })
    expect(parseFrameMessage({ v, type: 'error' })).toEqual({
      v,
      type: 'error',
      code: 'module_failed',
    })
  })

  it.each([
    ['not an object', 'ready'],
    ['null', null],
    ['no version', { type: 'ready' }],
    ['another version', { v: 2, type: 'ready' }],
    ['unknown type', { v, type: 'token' }],
    ['the removed viewed event', { v, type: 'event', name: 'viewed', occlusion: 'checked' }],
    ['the removed module message', { v, type: 'module', name: 'x', payload: 1 }],
    ['negative height', { v, type: 'size', height: -1 }],
    ['absurd height', { v, type: 'size', height: 1e9 }],
    ['non-finite height', { v, type: 'size', height: Number.NaN }],
    ['string height', { v, type: 'size', height: '10' }],
    ['emit without a name', { v, type: 'emit', data: 1 }],
    ['emit with a name outside the pattern', { v, type: 'emit', name: 'Bad Name' }],
    [
      'emit with data over the cap',
      { v, type: 'emit', name: 'x', data: 'a'.repeat(DATA_MAX_BYTES) },
    ],
  ])('refuses %s', (_label, data) => {
    expect(parseFrameMessage(data)).toBeNull()
  })

  it('drops a field the version does not know', () => {
    expect(parseFrameMessage({ v, type: 'ready', token: 'secret' })).toEqual({ v, type: 'ready' })
  })
})

describe('host message guard', () => {
  const start = {
    v,
    type: 'start',
    props: { a: 1 },
    consent: 'granted',
    theme: { scheme: 'dark' },
    display: 'modal',
  }

  it('accepts start, props, theme and consent, and refuses destroy', () => {
    expect(parseHostMessage(start)).toEqual(start)
    expect(parseHostMessage({ v, type: 'props', props: { b: 2 } })).toEqual({
      v,
      type: 'props',
      props: { b: 2 },
    })
    expect(parseHostMessage({ v, type: 'consent', state: 'granted' })).toEqual({
      v,
      type: 'consent',
      state: 'granted',
    })
    expect(parseHostMessage({ v, type: 'destroy' })).toBeNull()
    expect(parseHostMessage({ v, type: 'theme', theme: { scheme: 'dark' } })).toEqual({
      v,
      type: 'theme',
      theme: { scheme: 'dark' },
    })
  })

  it('keeps the props of start and props raw, for the frame to check', () => {
    expect(parseHostMessage({ ...start, props: 'text' })).toMatchObject({ props: 'text' })
    expect(parseHostMessage({ v, type: 'props', props: null })).toMatchObject({ props: null })
  })

  it.each([
    ['bad consent', { v, type: 'consent', state: 'maybe' }],
    ['theme not an object', { v, type: 'theme', theme: 'dark' }],
    ['start with a bad consent', { ...start, consent: 'maybe' }],
    ['start with a bad display', { ...start, display: 'popup' }],
    ['start with no theme', { ...start, theme: undefined }],
    ['the removed module message', { v, type: 'module', name: 'x', payload: 1 }],
    ['unknown type', { v, type: 'eval' }],
    ['not an object', 7],
  ])('refuses %s', (_label, data) => {
    expect(parseHostMessage(data)).toBeNull()
  })
})

describe('the shared JSON check', () => {
  it('accepts a plain object and returns a copy', () => {
    const input = { a: 1, nested: { b: [true, null, 'x'] } }
    const checked = checkJsonObject(input, PROPS_MAX_BYTES)
    expect(checked).toEqual({ ok: true, value: input })
    expect(checked.ok && checked.value).not.toBe(input)
  })

  it.each([
    ['an array', [1]],
    ['null', null],
    ['a string', 'x'],
    ['a class instance', new Date()],
    [
      'a cycle',
      (() => {
        const a: Record<string, unknown> = {}
        a['self'] = a
        return a
      })(),
    ],
    ['a BigInt', { n: 1n }],
  ])('refuses %s as invalid', (_label, value) => {
    expect(checkJsonObject(value, PROPS_MAX_BYTES)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuses an object over the cap, counting bytes not characters', () => {
    expect(checkJsonObject({ a: 'x'.repeat(PROPS_MAX_BYTES) }, PROPS_MAX_BYTES)).toEqual({
      ok: false,
      reason: 'too_large',
    })
    const wide = { a: 'é'.repeat(4100) }
    expect(JSON.stringify(wide).length).toBeLessThan(PROPS_MAX_BYTES)
    expect(checkJsonObject(wide, PROPS_MAX_BYTES)).toEqual({ ok: false, reason: 'too_large' })
  })

  it('checks any JSON value for emit data, and refuses what is not JSON', () => {
    expect(checkJson([1, 2], DATA_MAX_BYTES)).toEqual({ ok: true, value: [1, 2] })
    expect(checkJson('text', DATA_MAX_BYTES)).toEqual({ ok: true, value: 'text' })
    expect(checkJson(() => 1, DATA_MAX_BYTES)).toEqual({ ok: false, reason: 'invalid' })
    expect(DATA_MAX_BYTES).toBe(8192)
    expect(PROPS_MAX_BYTES).toBe(8192)
  })
})

describe('theme', () => {
  it('keeps valid values and drops the rest', () => {
    expect(
      parseTheme({
        scheme: 'dark',
        text: '#112233',
        accent: '#abc',
        radius: '8px',
        font: 'system-ui, sans-serif',
      }),
    ).toEqual({
      scheme: 'dark',
      text: '#112233',
      accent: '#abc',
      radius: '8px',
      font: 'system-ui, sans-serif',
    })
    expect(
      parseTheme({ scheme: 'blue', text: 'red; background:url(x)', radius: '1e9px', font: '}{' }),
    ).toEqual({})
  })

  it('round-trips through the frame address', () => {
    const theme = { scheme: 'light' as const, accent: '#0a0', radius: '4px' }
    expect(themeFromParams(themeToParams(theme))).toEqual(theme)
  })
})

describe('isHttpsUrl', () => {
  it('accepts https only', () => {
    expect(isHttpsUrl('https://example.test/path?q=1')).toBe(true)
    expect(isHttpsUrl('http://example.test')).toBe(false)
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpsUrl('//example.test')).toBe(false)
    expect(isHttpsUrl('not a url')).toBe(false)
  })
})
