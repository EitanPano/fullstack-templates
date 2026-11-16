// page.ts belongs: the cursor pagination every list endpoint shares: `?cursor=&limit=` in,
// `{ items, nextCursor }` out. The cursor is opaque to clients.
// It does not belong: a module's own list query beyond these two parameters.
import { z } from 'zod'

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PageQuery = z.infer<typeof PageQuery>

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() })
}
