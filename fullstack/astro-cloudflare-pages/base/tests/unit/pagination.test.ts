import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { PageQuery } from '@shared/schemas/page'

import { AppError } from '../../server/services/utils/error'
import { decodeCursor, encodeCursor, toPage } from '../../server/services/utils/pagination'

describe('PageQuery', () => {
  it('defaults the limit to 20 and bounds it to 1..100', () => {
    expect(PageQuery.parse({}).limit).toBe(20)
    expect(PageQuery.parse({ limit: '100' }).limit).toBe(100)
    expect(PageQuery.safeParse({ limit: '0' }).success).toBe(false)
    expect(PageQuery.safeParse({ limit: '101' }).success).toBe(false)
  })
})

describe('cursor', () => {
  const Cursor = z.object({ createdAt: z.number(), id: z.string() })

  it('round-trips a cursor, non-ASCII text included', () => {
    const cursor = encodeCursor({ createdAt: 1700000000000, id: 'café-1' })
    expect(decodeCursor(cursor, Cursor)).toEqual({ createdAt: 1700000000000, id: 'café-1' })
  })

  it('rejects a cursor it did not produce with a 400 validation error', () => {
    for (const bad of ['not base64 !!', encodeCursor({ other: 1 })]) {
      try {
        decodeCursor(bad, Cursor)
        expect.unreachable('should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).status).toBe(400)
      }
    }
  })
})

describe('toPage', () => {
  it('reports a next page only when an extra row was fetched', () => {
    expect(toPage([1, 2, 3], 2, String)).toEqual({ items: [1, 2], nextCursor: '2' })
    expect(toPage([1, 2], 2, String)).toEqual({ items: [1, 2], nextCursor: null })
    expect(toPage([], 2, String)).toEqual({ items: [], nextCursor: null })
  })
})
