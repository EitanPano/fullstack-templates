import { defineConfig } from '@hey-api/openapi-ts'

// The server's contract. tests/fixtures/openapi.json is what the committed output was first made from.
export const CONTRACT_INPUT = '../__SERVER_DIR__/openapi.json'

// Types only, and only the operations under /api/sdk/: no client, no zod, no other entity's shape
// ever reaches a public bundle (ADR 0020 K4). The output is committed and never edited.
export default defineConfig({
  input: CONTRACT_INPUT,
  output: { path: 'src/contract', postProcess: ['prettier'] },
  parser: { filters: { operations: { include: ['/api/sdk/'] } } },
  plugins: ['@hey-api/typescript'],
})
