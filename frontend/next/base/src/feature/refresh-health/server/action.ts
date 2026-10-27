'use server'

import { updateTag } from 'next/cache'

import { call } from '@/shared/api/call'
import { createApi } from '@/shared/api/client'
import { getApiHealth } from '@/shared/api/generated'
import { action } from '@/shared/lib/safe-action'

// A server action: validate the input, call the API, expire the tag the read is cached under.
// `updateTag` (Server Actions only) makes the next render read fresh data, so the widget shows
// the new value in the same response. `refreshHealth` takes no input, so it has no schema.
export const refreshHealth = action.action(async () => {
  // An uncached ping first: expiring the tag while the API is down would only swap one error for another.
  await call(getApiHealth({ client: createApi() }))
  updateTag('health')
  return { refreshed: true }
})
