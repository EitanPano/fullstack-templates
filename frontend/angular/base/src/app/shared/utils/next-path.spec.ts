import { safeNextPath } from './next-path'

// `next` comes from the address bar, so it is hostile input: only a path on this site is kept.
describe('safeNextPath', () => {
  it.each([
    ['a protocol-relative URL', '//evil.com'],
    ['a backslash host', '/\\evil.com'],
    ['an encoded second slash', '/%2Fevil.com'],
    ['an encoded backslash', '/%5Cevil.com'],
    ['an encoded CRLF', '/%0d%0aX-Injected: 1'],
    ['a raw newline', '/a\nb'],
    ['an absolute URL', 'https://evil.com'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['a bare host', 'evil.com'],
    ['an empty string', ''],
    ['undefined', undefined],
    ['null', null],
    ['an array', ['/a']],
    ['the login screen', '/auth/login'],
    ['the register screen with a query', '/auth/register?x=1'],
    ['the login screen with a hash', '/auth/login#x'],
    ['a malformed escape', '/%zz'],
  ])('sends %s home', (_what, value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it.each(['/profile', '/profile?tab=1#x', '/a/b', '/auth/login-help', '/auth/verify-otp', '/'])(
    'keeps %s',
    (value) => {
      expect(safeNextPath(value)).toBe(value)
    },
  )
})
