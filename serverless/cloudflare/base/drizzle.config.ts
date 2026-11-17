import { defineConfig } from 'drizzle-kit'

// Only generates SQL into migrations/; wrangler applies it (`bun run migrate`).
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./server/api/*/model.ts', './server/infra/tables.ts'],
  out: './migrations',
})
