import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApi } from '@/shared/api/client'
import { getApiHealth } from '@/shared/api/generated'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.resetModules()
})

type Create = typeof createApi

async function sentRequest(create: Create, options?: Parameters<Create>[0]) {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }))
  vi.stubGlobal('fetch', fetchMock)
  await getApiHealth({ client: create(options) })
  return fetchMock.mock.calls[0]?.[0] as Request
}

// CLIENT_IP_HEADER is read once, when the env module loads, so each case loads a fresh module.
async function clientWith(header: string | undefined): Promise<Create> {
  vi.resetModules()
  vi.stubEnv('CLIENT_IP_HEADER', header ?? '')
  return (await import('@/shared/api/client')).createApi
}

describe('createApi', () => {
  it('sends a request to API_URL with no ambient credentials and no bearer by default', async () => {
    const request = await sentRequest(createApi)

    expect(request.credentials).toBe('omit')
    expect(request.headers.get('authorization')).toBeNull()
    expect(request.headers.get('x-forwarded-for')).toBeNull()
  })

  it('sends the access token as a bearer', async () => {
    const request = await sentRequest(createApi, { accessToken: 'tok' })

    expect(request.headers.get('authorization')).toBe('Bearer tok')
  })

  it('builds a new client per call, so one request never sees another one token', () => {
    expect(createApi({ accessToken: 'a' })).not.toBe(createApi({ accessToken: 'b' }))
  })
})

describe('createApi client address (CLIENT_IP_HEADER)', () => {
  const visitor = (value: string, name = 'x-forwarded-for') => new Headers({ [name]: value })

  it('forwards nothing when CLIENT_IP_HEADER is unset, whatever the visitor sent', async () => {
    const create = await clientWith(undefined)

    const request = await sentRequest(create, { clientHeaders: visitor('6.6.6.6') })

    expect(request.headers.get('x-forwarded-for')).toBeNull()
  })

  it('forwards the rightmost entry of the configured header', async () => {
    const create = await clientWith('x-forwarded-for')

    const request = await sentRequest(create, { clientHeaders: visitor('6.6.6.6, 203.0.113.9') })

    expect(request.headers.get('x-forwarded-for')).toBe('203.0.113.9')
  })

  it('ignores an entry a client put to the left of the one the proxy added', async () => {
    const create = await clientWith('x-forwarded-for')

    const request = await sentRequest(create, {
      clientHeaders: visitor('1.1.1.1, 2.2.2.2, 198.51.100.7'),
    })

    expect(request.headers.get('x-forwarded-for')).toBe('198.51.100.7')
  })

  it('reads a single-value header such as x-real-ip, in any letter case', async () => {
    const create = await clientWith('X-Real-IP')

    const request = await sentRequest(create, {
      clientHeaders: visitor('203.0.113.10', 'x-real-ip'),
    })

    expect(request.headers.get('x-forwarded-for')).toBe('203.0.113.10')
  })

  it('forwards an IPv6 address', async () => {
    const create = await clientWith('x-forwarded-for')

    const request = await sentRequest(create, { clientHeaders: visitor('2001:db8::1') })

    expect(request.headers.get('x-forwarded-for')).toBe('2001:db8::1')
  })

  it('forwards nothing when the entry is not an address (no header injection)', async () => {
    const create = await clientWith('x-forwarded-for')

    for (const value of ['unknown', '1.2.3.4, evil', ' , ']) {
      const request = await sentRequest(create, { clientHeaders: visitor(value) })
      expect(request.headers.get('x-forwarded-for')).toBeNull()
    }
  })

  it('drops an IPv6 zone id', async () => {
    const create = await clientWith('x-forwarded-for')

    const request = await sentRequest(create, { clientHeaders: visitor('fe80::1%eth0') })

    expect(request.headers.get('x-forwarded-for')).toBeNull()
  })

  it('forwards nothing when the configured header is absent from the request', async () => {
    const create = await clientWith('x-real-ip')

    const request = await sentRequest(create, { clientHeaders: visitor('6.6.6.6') })

    expect(request.headers.get('x-forwarded-for')).toBeNull()
  })

  it('forwards nothing without request headers (a cached loader never forwards a visitor)', async () => {
    const create = await clientWith('x-forwarded-for')

    const request = await sentRequest(create)

    expect(request.headers.get('x-forwarded-for')).toBeNull()
  })
})
