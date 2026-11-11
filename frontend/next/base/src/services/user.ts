import 'server-only'

import { cache } from 'react'

import type { User } from '@/models/user/type'

import { call } from './call'
import { createRequestApi } from './client'
import { getApiUserMe } from './generated'

// The account an access token belongs to, as the API says: the result of `GET /api/user/me`.
// Memoised per request (React `cache`), so the session guard and a page that shows the account
// share one call.
export const getMe = cache(async (accessToken: string) =>
  getApiUserMe({ client: await createRequestApi({ accessToken }) }),
)

// The account for a page that shows it: the data, or an ActionError like every read.
export async function getProfile(accessToken: string): Promise<User> {
  return call(getMe(accessToken))
}
