import { flag, object, parse, text } from '@/shared/utils/validation'

// The only file that reads import.meta.env. Vite compiles every VITE_* variable into the
// @noserver-start
// bundle, so a value declared here is public: never a secret.
// @noserver-end
// @server-start
// bundle, so a value declared here is public: never a secret. The API needs no entry: it is
// always reached at relative /api, and so does the visitor's address (the server sees the browser
// through the dev and preview servers, nginx or itself; AGENTS.md › Deployment).
// @server-end
const schema = object({
  MODE: text(),
  DEV: flag(),
})

const parsed = parse(schema, import.meta.env)

// isDev is true under the dev server only; production builds and the preview are false.
export const env = { MODE: parsed.MODE, isDev: parsed.DEV }
