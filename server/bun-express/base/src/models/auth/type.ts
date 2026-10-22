// type.ts belongs: the shapes of the auth capability that several layers share. A models/
// directory exists for a capability too (not only for a resource) when other layers share its
// types. It does not belong: stored records (auth has none; see models/user and
// models/session) or value sets (enum.ts).
import type { UserRole } from '../user/enum'
import type { PublicUser } from '../user/type'

// The authenticated caller a protected endpoint receives.
export type Caller = {
  id: string
  role: UserRole
  sessionId: string
}

// Timestamps are ISO strings.
export type AuthTokens = {
  accessToken: string
  accessExpiresAt: string
  refreshToken: string
  refreshExpiresAt: string
}

export type AuthSession = { user: PublicUser; tokens: AuthTokens }

// Tokens only on the login purpose: verifying a contact does not start a session.
export type OtpVerified = { user: PublicUser; tokens?: AuthTokens | undefined }
