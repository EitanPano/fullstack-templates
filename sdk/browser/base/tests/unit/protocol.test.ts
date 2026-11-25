import { describe, expect, it } from 'vitest'

import {
  HANDSHAKE_KIND,
  PROTOCOL_VERSION,
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
  it('accepts ready, size, event and module messages', () => {
    expect(parseFrameMessage({ v, type: 'ready' })).toEqual({ v, type: 'ready' })
    expect(parseFrameMessage({ v, type: 'size', height: 120.5 })).toEqual({
      v,
      type: 'size',
      height: 120.5,
    })
    expect(parseFrameMessage({ v, type: 'event', name: 'rendered' })).toEqual({
      v,
      type: 'event',
      name: 'rendered',
    })
    expect(parseFrameMessage({ v, type: 'event', name: 'viewed', occlusion: 'checked' })).toEqual({
      v,
      type: 'event',
      name: 'viewed',
      occlusion: 'checked',
    })
    expect(parseFrameMessage({ v, type: 'module', name: 'x', payload: { a: 1 } })).toEqual({
      v,
      type: 'module',
      name: 'x',
      payload: { a: 1 },
    })
  })

  it.each([
    ['not an object', 'ready'],
    ['null', null],
    ['no version', { type: 'ready' }],
    ['another version', { v: 2, type: 'ready' }],
    ['unknown type', { v, type: 'token' }],
    ['negative height', { v, type: 'size', height: -1 }],
    ['absurd height', { v, type: 'size', height: 1e9 }],
    ['non-finite height', { v, type: 'size', height: Number.NaN }],
    ['string height', { v, type: 'size', height: '10' }],
    ['unknown event', { v, type: 'event', name: 'paid' }],
    ['view without occlusion', { v, type: 'event', name: 'viewed' }],
    ['view with another occlusion', { v, type: 'event', name: 'viewed', occlusion: 'yes' }],
    ['module without name', { v, type: 'module', payload: 1 }],
  ])('refuses %s', (_label, data) => {
    expect(parseFrameMessage(data)).toBeNull()
  })

  it('drops a field the version does not know', () => {
    expect(parseFrameMessage({ v, type: 'ready', token: 'secret' })).toEqual({ v, type: 'ready' })
  })
})

describe('host message guard', () => {
  it('accepts theme, consent, module and destroy', () => {
    expect(parseHostMessage({ v, type: 'consent', state: 'granted' })).toEqual({
      v,
      type: 'consent',
      state: 'granted',
    })
    expect(parseHostMessage({ v, type: 'destroy' })).toEqual({ v, type: 'destroy' })
    expect(parseHostMessage({ v, type: 'theme', theme: { scheme: 'dark' } })).toEqual({
      v,
      type: 'theme',
      theme: { scheme: 'dark' },
    })
    expect(parseHostMessage({ v, type: 'module', name: 'x', payload: 'text' })).toEqual({
      v,
      type: 'module',
      name: 'x',
      payload: 'text',
    })
  })

  it.each([
    ['bad consent', { v, type: 'consent', state: 'maybe' }],
    ['theme not an object', { v, type: 'theme', theme: 'dark' }],
    ['unknown type', { v, type: 'eval' }],
    ['not an object', 7],
  ])('refuses %s', (_label, data) => {
    expect(parseHostMessage(data)).toBeNull()
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
