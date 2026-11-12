import type { User } from '@/models/user/type'

// What the auth tests share: an account as the API names it, the sign-in response around it, and
// an error envelope. Kept out of each test so the contract's shape is spelled once.
export const USER: User = {
  id: 'u1',
  email: 'ada@example.com',
  phone: null,
  role: 'user',
  status: 'active',
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

export const SESSION = {
  user: USER,
  tokens: {
    accessToken: 'access-token-value',
    accessExpiresAt: '2026-01-01T00:15:00.000Z',
    refreshToken: 'refresh-token-value',
    refreshExpiresAt: '2026-02-01T00:00:00.000Z',
  },
}

export const envelope = (code: string, status: number) =>
  Response.json({ error: { code, message: 'server text' }, requestId: 'r1' }, { status })
