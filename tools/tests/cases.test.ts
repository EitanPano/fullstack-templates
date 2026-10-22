import { describe, expect, test } from 'bun:test'
import { loadCatalog } from '../lib/catalog'
import { listCases, requestFor } from '../lib/cases'
import { FIXTURE } from './helpers'

describe('cases', () => {
  test('lists every case with a stable id', () => {
    expect(listCases(loadCatalog(FIXTURE)).map((c) => c.id)).toEqual([
      'frontend/mini-ui/alone',
      'frontend/mini-ui/default',
      'server/mini/auth-off',
      'server/mini/default',
    ])
  })
  test('builds a stack request with package-qualified flags and a template request with shorthands', () => {
    const cases = listCases(loadCatalog(FIXTURE))
    const front = requestFor(
      cases.find((c) => c.id === 'frontend/mini-ui/default')!,
      'out',
    )
    expect(front.stack).toBe('mini')
    expect(front.template).toBeUndefined()
    expect(front.answers?.packages).toEqual({ frontend: { flags: {}, capabilities: {} } })
    expect(front.name).toBe('demo')
    expect(front.skipPostGenerate).toBe(false)
    const off = requestFor(
      cases.find((c) => c.id === 'server/mini/auth-off')!,
      'out',
    )
    expect(off.template).toBe('server/mini')
    expect(off.stack).toBeUndefined()
    expect(off.flags).toEqual(['auth=false'])
    expect(off.capabilities).toEqual([])
  })
})
