import 'server-only'

import { z } from 'zod'

// The only file that reads process.env. Importing it from a Client Component fails at build
// time (`server-only`), which is the point: browser-visible values are NEXT_PUBLIC_* and
// declared in a separate, explicitly public schema when the product needs one.
const schema = z.object({
  API_URL: z.url().default('http://localhost:__SERVER_PORT__'),
})

export const env = schema.parse(process.env)
