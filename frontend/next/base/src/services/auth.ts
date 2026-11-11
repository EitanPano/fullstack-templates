import 'server-only'

import type { Credentials } from '@/models/auth/type'

import { createApi, createRequestApi } from './client'
import {
  postApiAuthLogin,
  postApiAuthLogout,
  postApiAuthRefresh,
  postApiAuthRegister,
} from './generated'

// The auth endpoints of the API. Each returns the generated client's result
// (`{ data, error, response }`) for `call()` or the session code to read; none throws on a 4xx.
export async function login(body: Credentials) {
  return postApiAuthLogin({ client: await createRequestApi(), body })
}

export async function signup(body: Credentials) {
  return postApiAuthRegister({ client: await createRequestApi(), body })
}

export async function logout(accessToken: string) {
  return postApiAuthLogout({ client: await createRequestApi({ accessToken }), body: {} })
}

// A refresh for a visitor: pass the request's headers so the API's per-address limits see them.
export function refresh(refreshToken: string, clientHeaders?: Headers) {
  return postApiAuthRefresh({ client: createApi({ clientHeaders }), body: { refreshToken } })
}
