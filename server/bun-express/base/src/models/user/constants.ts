// constants.ts belongs: limits of the user data itself (lengths, patterns). It does not
// belong: policy such as durations, attempts or rate windows (config/constants.ts), value sets
// (enum.ts) or object shapes (type.ts).
export const USER_LIMITS = {
  email: { max: 254 },
  password: { min: 8, max: 128 },
  // E.164: a plus sign, a non-zero first digit, up to 15 digits in all.
  phone: { pattern: /^\+[1-9]\d{1,14}$/ },
} as const
