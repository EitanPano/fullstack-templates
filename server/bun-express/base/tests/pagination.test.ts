import { describe, expect, it } from 'bun:test'

import { AppError } from '../src/services/utils/error'
import { PageQuery, decodeCursor, encodeCursor, toPage } from '../src/services/utils/pagination'
import { z } from '../src/services/utils/zod'

const Key = z.object({ createdAt: z.string(), id: z.string() })

describe('pagination', () => {
  it('defaults and bounds the limit', () => {
    expect(PageQuery.parse({})).toEqual({ limit: 20 })
    expect(PageQuery.safeParse({ limit: '0' }).success).toBe(false)
    expect(PageQuery.safeParse({ limit: '101' }).success).toBe(false)
  })

  it('round-trips a cursor', () => {
    const cursor = encodeCursor({ createdAt: '2026-01-01T00:00:00.000Z', id: 'a' })

    expect(decodeCursor(cursor, Key)).toEqual({ createdAt: '2026-01-01T00:00:00.000Z', id: 'a' })
  })

  it('rejects a cursor it did not produce', () => {
    expect(() => decodeCursor('not-base64-json', Key)).toThrow(AppError)
    expect(() => decodeCursor(encodeCursor({ other: 1 }), Key)).toThrow(AppError)
  })

  it('reports a next page only when an extra row was fetched', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

    expect(toPage(rows, 2, (row) => row.id)).toEqual({ items: rows.slice(0, 2), nextCursor: 'b' })
    expect(toPage(rows, 3, (row) => row.id)).toEqual({ items: rows, nextCursor: null })
  })
})
