// What a request to the API looks like, for both callers of `fetch` (transport/ on the host side,
// frame/sender.ts inside the frame). They share it so the rules cannot drift: no cookie, the key
// header, the default cache mode (`no-store` defeats the preflight cache), and JSON with
// `keepalive` for telemetry. Never `sendBeacon`: with a JSON body it is credentialed.
export const KEY_HEADER = 'X-Sdk-Key'
export const CONFIG_PATH = '/api/sdk/v1/config'
export const TELEMETRY_PATH = '/api/sdk/v1/telemetry'

export type RequestOptions = {
  key: string
  signal: AbortSignal
  body?: unknown
  keepalive?: boolean
}

export function requestInit(options: RequestOptions): RequestInit {
  const headers: Record<string, string> = { [KEY_HEADER]: options.key }
  const init: RequestInit = {
    method: options.body === undefined ? 'GET' : 'POST',
    headers,
    credentials: 'omit',
    signal: options.signal,
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(options.body)
  }
  if (options.keepalive) init.keepalive = true
  return init
}
