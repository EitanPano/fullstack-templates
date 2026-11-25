// sdk-assets.ts belongs: the fake `ASSETS` and the bindings the SDK tests run the Worker with. The
// fake answers exactly the paths it is given, like the platform's assets do, and remembers every
// request it saw, so a test sees which path the Worker asked for. It does not belong: assertions.
import { env } from 'cloudflare:workers'

export const KEY_A = 'pk_test_a'
export const KEY_B = 'pk_test_b'
export const A = 'https://a.example.test'
export const B = 'https://b.example.test'
export const C = 'https://c.example.test'
export const LOCAL = 'http://localhost:5190'

export const KEYS = `${KEY_A}=${A},${B};${KEY_B}=${C}`

// `headers` stand for what a `_headers` rule adds to every file the assets serve.
export function sdkAssets(
  files: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const seen: Request[] = []
  const fetcher = {
    fetch(input: Request) {
      seen.push(input)
      const body = files[new URL(input.url).pathname]
      if (body === undefined) {
        return Promise.resolve(new Response('<title>404 page</title>', { status: 404 }))
      }
      return Promise.resolve(
        new Response(input.method === 'HEAD' ? null : body, {
          headers: { 'content-type': 'application/octet-stream', ...headers },
        }),
      )
    },
  }
  return { seen, fetcher }
}

// The Worker's bindings with the SDK variables a test chooses; `SDK_KEYS` unset when `keys` is null.
export function sdkBindings(
  extra: Record<string, unknown> = {},
  keys: string | null = KEYS,
): Record<string, unknown> {
  const bindings: Record<string, unknown> = { ...env, ...extra }
  if (keys === null) delete bindings.SDK_KEYS
  else bindings.SDK_KEYS = keys
  return bindings
}

export const paths = (seen: Request[]) => seen.map((request) => new URL(request.url).pathname)
