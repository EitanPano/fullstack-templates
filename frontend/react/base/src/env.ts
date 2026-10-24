import { z } from 'zod'

// The only file that reads import.meta.env. Vite compiles every VITE_* variable into the
// bundle, so a value declared here is public: never a secret. The API needs no entry, it is
// always reached at relative /api.
const schema = z.object({
  MODE: z.string(),
})

export const env = schema.parse(import.meta.env)
