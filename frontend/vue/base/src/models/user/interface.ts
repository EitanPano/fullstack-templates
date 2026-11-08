import type {
  AuthSession,
  Credentials,
  OtpRequestBody,
  OtpVerificationBody,
  OtpVerified,
  PublicUser,
  UpdateMeBody,
} from '@/services/generated/types.gen'

export type {
  AuthSession,
  Credentials,
  OtpRequestBody,
  OtpVerificationBody,
  OtpVerified,
  PublicUser,
  UpdateMeBody,
}

// The roles the contract declares. Renaming one edits constants.ts, every `meta.roles`, the specs
// and the agents file, after the server and `contract`.
export type Role = PublicUser['role']
