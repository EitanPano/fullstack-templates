// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const contractDir = fileURLToPath(new URL('../../src/contract', import.meta.url))

// The contract tool runs on the fixture until the server exists (ADR 0020 K4): the committed
// output holds the SDK namespace's types and nothing else of the document.
describe('the filtered contract', () => {
  const fixture = JSON.parse(read('../fixtures/openapi.json')) as { paths: Record<string, unknown> }
  const types = read('../../src/contract/types.gen.ts')

  it('has a fixture with two paths in the namespace and one outside it', () => {
    expect(Object.keys(fixture.paths).sort()).toEqual([
      '/api/other/thing',
      '/api/sdk/v1/config',
      '/api/sdk/v1/telemetry',
    ])
  })

  it('holds the types of the SDK path', () => {
    expect(types).toContain('SdkConfig')
    expect(types).toContain('enabled: boolean')
    expect(types).toContain('/api/sdk/v1/config')
  })

  it('holds the telemetry body the frame sends', () => {
    expect(types).toContain('SdkTelemetryBody')
    expect(types).toContain('/api/sdk/v1/telemetry')
    expect(types).toContain('PostSdkTelemetryData')
  })

  it('holds nothing of the path outside /api/sdk/', () => {
    for (const word of ['OtherThing', 'secretField', 'getOtherThing', '/api/other']) {
      expect(types).not.toContain(word)
    }
  })

  it('has types only: no client, no sdk functions, no zod schemas', () => {
    expect(readdirSync(contractDir).sort()).toEqual(['index.ts', 'types.gen.ts'])
    expect(types).not.toMatch(/\bzod\b|client-fetch|export const /)
  })
})
