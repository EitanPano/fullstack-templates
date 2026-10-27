import { defineConfig } from '@hey-api/openapi-ts'

// The contract is the server's openapi.json. The output is committed and never edited: types, a
// fetch client emitted into generated/ (no runtime package), zod schemas for forms and TanStack
// Query options and keys for the reads.
export default defineConfig({
  input: '../__SERVER_DIR__/openapi.json',
  output: { path: 'src/shared/api/generated', postProcess: ['prettier'] },
  plugins: [
    '@hey-api/typescript',
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/shared/api/client.ts' },
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
    'zod',
    { name: '@tanstack/react-query', infiniteQueryOptions: false },
  ],
})
