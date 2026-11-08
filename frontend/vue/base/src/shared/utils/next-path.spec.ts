import { describe, expect, it } from 'vitest'

import { safeNextPath } from './next-path'

describe('safeNextPath', () => {
  it.each(['/profile', '/profile?tab=2', '/a/b#c', '/'])(
    'keeps the path on this site %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path)
    },
  )

  it.each([
    ['another origin', 'https://evil.example/x'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash host', '/\\evil.example'],
    ['an encoded backslash', '/%5Cevil.example'],
    ['an encoded protocol-relative URL', '/%2F%2Fevil.example'],
    ['a lower-case encoded slash', '/%2f/evil.example'],
    ['a newline', '/a\nSet-Cookie: x'],
    ['an encoded newline', '/a%0d%0aX'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a relative path', 'profile'],
    ['a sign-in screen', '/auth/login?next=/x'],
    ['the register screen', '/auth/register'],
    ['nothing', undefined],
    ['a list', ['/a', '/b']],
    ['a number', 7],
  ])('answers home for %s', (_name, value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it('answers home for text that cannot be decoded', () => {
    expect(safeNextPath('/%E0%A4%A')).toBe('/')
  })

  it('keeps the OTP step, which is no sign-in screen', () => {
    expect(safeNextPath('/auth/verify-otp')).toBe('/auth/verify-otp')
  })
})
