import { defineConfig } from '@hey-api/openapi-ts'

// The contract is the server's openapi.json. The output is committed and never edited:
// types, a fetch client emitted into generated/ (no runtime package) and zod schemas for forms.
export default defineConfig({
  input: '../__SERVER_DIR__/openapi.json',
  output: { path: 'src/shared/api/generated', postProcess: ['prettier'] },
  plugins: [
    '@hey-api/typescript',
    '@hey-api/client-fetch',
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
    'zod',
  ],
})
