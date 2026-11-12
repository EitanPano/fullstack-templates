import 'server-only'

import {
  object,
  parse,
  text,
  withDefault,
  // @server-start
  optional,
  pipe,
  transform,
  url,
  // @server-end
} from '@/shared/utils/validation'

// The only file that reads process.env. Importing it from a Client Component fails at build
// time (`server-only`), which is the point: browser-visible values are NEXT_PUBLIC_* and
// declared in a separate, explicitly public schema when the product needs one.
const schema = object({
  // @server-start
  API_URL: withDefault(url(), 'http://localhost:__SERVER_PORT__'),
  // @server-end
  // Only 'production' matters (session cookies are Secure); any other name, such as `staging`,
  // is accepted rather than crashing startup.
  NODE_ENV: withDefault(text(), 'development'),
  // @server-start
  // The request header that carries the visitor's address as a proxy you control set or appended
  // it (`x-forwarded-for`, `x-real-ip`). Unset: no address is forwarded to the API and every
  // visitor shares one per-address bucket there (AGENTS.md › Deployment).
  CLIENT_IP_HEADER: pipe(
    transform(optional(text()), (value) => value?.trim().toLowerCase() || undefined),
    // A header name, checked here so a typo stops the server at startup instead of throwing in
    // every request that reads it.
    optional(
      text({
        pattern: /^[a-z0-9-]+$/,
        message: 'CLIENT_IP_HEADER must be an HTTP header name such as x-forwarded-for',
      }),
    ),
  ),
  // @server-end
})

export const env = parse(schema, process.env)
