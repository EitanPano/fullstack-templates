import { defineConfig } from '@hey-api/openapi-ts'

// The contract is the server's openapi.json. The output is committed and never edited: types, the
// Angular client emitted into generated/ (no runtime package), the flat SDK and zod schemas for
// forms. `runtimeConfigPath` has no extension: the generator writes it into an import, and
// Angular's tsconfig refuses a `.ts` specifier. `throwOnError` types every call's `data` as
// present and makes a failure reject, so a facade never repeats it.
export default defineConfig({
  input: '../__SERVER_DIR__/openapi.json',
  output: { path: 'src/app/services/generated', postProcess: ['prettier'] },
  plugins: [
    '@hey-api/typescript',
    {
      name: '@hey-api/client-angular',
      runtimeConfigPath: './src/app/core/config/api-client',
      throwOnError: true,
    },
    { name: '@hey-api/sdk', operations: { strategy: 'flat' } },
    'zod',
  ],
})
