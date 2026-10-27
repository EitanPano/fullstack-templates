// The proxy decides when to refresh by reading `exp` from the access token. It does not verify
// the signature: the API does that on every call, and nothing here grants access. A token this
// cannot read counts as expired, which only costs one refresh.
const SKEW_SECONDS = 10

export function isAccessTokenExpired(token: string, now = Date.now()): boolean {
  const payload = token.split('.')[1]
  if (!payload) return true
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof claims !== 'object' || claims === null || !('exp' in claims)) return true
    if (typeof claims.exp !== 'number') return true
    return claims.exp * 1000 - SKEW_SECONDS * 1000 <= now
  } catch {
    return true
  }
}
