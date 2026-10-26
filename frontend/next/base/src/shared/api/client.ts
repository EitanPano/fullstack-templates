import { isIP } from 'node:net'

import { headers as requestHeaders } from 'next/headers'

import { env } from '@/shared/config/env'

import { createClient, createConfig } from './generated/client'
import type { ClientOptions } from './generated/types.gen'

// The visitor's address as a trusted proxy reported it: the RIGHTMOST entry of the configured
// header, because a proxy appends the address it saw and anything to the left was sent by the
// client. Anything that is not an IP address is dropped (it would be a header injection).
function clientAddress(from: Headers | undefined): string | undefined {
  if (!env.CLIENT_IP_HEADER || !from) return undefined
  const value = from.get(env.CLIENT_IP_HEADER)?.split(',').at(-1)?.trim()
  // A zone id (fe80::1%eth0) is local to a host and meaningless to the API.
  return value && !value.includes('%') && isIP(value) !== 0 ? value : undefined
}

// A client for one request, built on the server with `API_URL`. A read for the signed-in
// account passes that account's access token, which goes as `Authorization: Bearer`. A call made
// for a visitor (sign-in, sign-up, refresh) passes `clientHeaders` (the request's headers) so
// the API's per-address limits see the visitor and not this server; with `CLIENT_IP_HEADER`
// unset nothing is forwarded. A public cached loader passes neither.
//
// Never use the module-level `client` that `generated/client.gen.ts` exports: it is shared by
// every request and points at `/`. Never set a custom `fetch`: the generated client builds a
// Request and calls the global one, which tests stub.
export function createApi(options: { accessToken?: string; clientHeaders?: Headers } = {}) {
  const forwarded = clientAddress(options.clientHeaders)
  const headers: Record<string, string> = {}
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`
  if (forwarded) headers['X-Forwarded-For'] = forwarded
  return createClient(
    createConfig<ClientOptions>({
      baseUrl: env.API_URL,
      // The fetch spec retries a 401 for a request with ambient credentials, which Next's patched
      // fetch cannot replay ("expected non-null body source"): every error response of a POST
      // would surface as a network failure. The API takes explicit headers only.
      credentials: 'omit',
      headers,
    }),
  )
}

// `createApi` for the current request: reads the request's headers itself. Not for a
// `'use cache'` scope (headers are forbidden there) or the proxy (pass `request.headers`).
export async function createRequestApi(options: { accessToken?: string } = {}) {
  return createApi({ ...options, clientHeaders: await requestHeaders() })
}
