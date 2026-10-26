const AUTH_SCREENS = /^\/sign-(in|up)(\/|\?|#|$)/
// Backslashes and control characters: browsers read `/\host` as `//host`, and a newline can
// split a header.
const UNSAFE = /[\\\u0000-\u001f\u007f]/

// Where to send an account after it signs in: the page it was sent away from, but only a path
// on this site. Anything else (another origin, a protocol-relative URL, a control character)
// is the home page, so the `next` parameter cannot be used as an open redirect.
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (UNSAFE.test(value)) return '/'
  let decoded: string
  try {
    decoded = decodeURIComponent(value)
  } catch {
    return '/'
  }
  if (UNSAFE.test(decoded) || decoded.startsWith('//')) return '/'
  if (AUTH_SCREENS.test(value)) return '/'
  return value
}
