import { defineConfig } from '@hey-api/openapi-ts'

// The contract is the server's openapi.json. The output is committed and never edited: types, a
// fetch client emitted into generated/ (no runtime package), the flat SDK and zod schemas for
// forms. services/<entity>.ts files wrap the SDK through services/api.ts by hand, so no query
// plugin.
export default defineConfig({
  input: '../__SERVER_DIR__/openapi.json',
  output: { path: 'src/services/generated', postProcess: ['prettier'] },
  plugins: [
    '@hey-api/typescript',
    { name: '@hey-api/client-fetch', runtimeConfigPath: './src/services/api-client.ts' },
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
    'zod',
  ],
})
