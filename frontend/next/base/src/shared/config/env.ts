import 'server-only'

import { z } from 'zod'

// The only file that reads process.env. Importing it from a Client Component fails at build
// time (`server-only`), which is the point: browser-visible values are NEXT_PUBLIC_* and
// declared in a separate, explicitly public schema when the product needs one.
const schema = z.object({
  API_URL: z.url().default('http://localhost:__SERVER_PORT__'),
  // Only 'production' matters (session cookies are Secure); any other name, such as `staging`,
  // is accepted rather than crashing startup.
  NODE_ENV: z.string().default('development'),
  // The request header that carries the visitor's address as a proxy you control set or appended
  // it (`x-forwarded-for`, `x-real-ip`). Unset: no address is forwarded to the API and every
  // visitor shares one per-address bucket there (AGENTS.md › Deployment).
  CLIENT_IP_HEADER: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() || undefined)
    // A header name, checked here so a typo stops the server at startup instead of throwing in
    // every request that reads it.
    .pipe(
      z
        .string()
        .regex(
          /^[a-z0-9-]+$/,
          'CLIENT_IP_HEADER must be an HTTP header name such as x-forwarded-for',
        )
        .optional(),
    ),
})

export const env = schema.parse(process.env)
