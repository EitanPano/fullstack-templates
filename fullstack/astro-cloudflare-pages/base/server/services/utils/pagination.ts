// pagination.ts belongs: the server half of cursor pagination (the query and page schemas are in
// shared/schemas/page.ts): the opaque cursor and the page slice. The cursor is opaque to clients;
// the data layer decides what it encodes (typically the last row's sort key and id).
// It does not belong: a module's own sort order (its service.ts).
import type { Page } from '@shared/types/api'
import type { ZodType } from 'zod'

import { base64UrlToText, textToBase64Url } from './encoding'
import { AppError } from './error'

export function encodeCursor(value: Record<string, string | number>): string {
  return textToBase64Url(JSON.stringify(value))
}

export function decodeCursor<T extends Record<string, string | number>>(
  cursor: string,
  schema: ZodType<T>,
): T {
  let parsed: unknown
  try {
    parsed = JSON.parse(base64UrlToText(cursor))
  } catch {
    throw new AppError('validation_failed', 'invalid cursor')
  }
  const result = schema.safeParse(parsed)
  if (!result.success) throw new AppError('validation_failed', 'invalid cursor')
  return result.data
}

// Fetch `limit + 1` rows, then slice: the extra row proves there is a next page.
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  const nextCursor = rows.length > limit && last !== undefined ? cursorOf(last) : null
  return { items, nextCursor }
}
