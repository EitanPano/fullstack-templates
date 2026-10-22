import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi'
import { z } from 'zod'

// Every schema file imports `z` from here so `.openapi()` is available and the extension is
// applied exactly once, in one visible place.
extendZodWithOpenApi(z)

export { z }
