import { describe, expect, it } from 'vitest'

import { safeNextPath } from '@/shared/auth/next-path'

// `next` comes from the address bar, so it is hostile input: only a path on this site is kept.
describe('safeNextPath', () => {
  it.each([
    ['a protocol-relative URL', '//evil.com'],
    ['a backslash host', '/\\evil.com'],
    ['a slash then backslash host', '/\\/evil.com'],
    ['an encoded second slash', '/%2Fevil.com'],
    ['an encoded backslash', '/%5Cevil.com'],
    ['an encoded tab then slash', '/%09/evil.com'],
    ['an encoded CRLF', '/%0d%0aX-Injected: 1'],
    ['a raw tab', '/\t/x'],
    ['a raw newline', '/a\nb'],
    ['an absolute URL', 'https://evil.com'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a bare host', 'evil.com'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['an array', ['/a']],
    ['the sign-in screen', '/sign-in'],
    ['the sign-up screen with a query', '/sign-up?x=1'],
    ['the sign-in screen with a hash', '/sign-in#x'],
    ['a malformed escape', '/%zz'],
  ])('sends %s home', (_what, value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it.each(['/profile', '/profile?tab=1#x', '/a/b', '/sign-in-help', '/'])('keeps %s', (value) => {
    expect(safeNextPath(value)).toBe(value)
  })
})
