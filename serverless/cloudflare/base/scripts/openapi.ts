// openapi belongs: `bun run openapi`, writing openapi.json from server/openapi.ts. It runs in Bun,
// outside the runtime, and imports nothing that needs a binding. Its one job is to run: it does not
// test `import.meta.main` (on Windows a working directory spelled in another case makes Bun's
// `import.meta.main` false and a guarded script would exit 0 having written nothing).
// It does not belong: building the document (server/openapi.ts).
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { buildOpenApiDocument } from '../server/openapi'

const target = path.join(import.meta.dirname, '..', 'openapi.json')
writeFileSync(target, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`)
console.log('wrote openapi.json')
