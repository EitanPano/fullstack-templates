import { z } from 'zod'

// The only file that reads import.meta.env. Vite compiles every VITE_* variable into the
// bundle, so a value declared here is public: never a secret. The API needs no entry: it is // @server
// bundle, so a value declared here is public: never a secret. // @noserver
// @server-start
// always reached at relative /api, and so does the visitor's address (the server sees the browser
// through the dev and preview servers, nginx or itself; AGENTS.md › Deployment).
// @server-end
const schema = z.object({
  MODE: z.string(),
})

export const env = schema.parse(import.meta.env)
