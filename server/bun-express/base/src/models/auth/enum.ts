// enum.ts belongs: the auth capability's closed value sets, each an `as const` object plus a
// derived union type of the same name. It does not belong: open-ended strings,
// limits (user/constants.ts), object shapes (type.ts) or policy (config/constants.ts).
export const OtpPurpose = { login: 'login', verify: 'verify' } as const
export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose]
