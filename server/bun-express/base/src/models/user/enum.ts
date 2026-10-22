// enum.ts belongs: the user's closed value sets, each an `as const` object plus a derived
// union type of the same name. It does not belong: open-ended strings, limits or shapes.
export const UserRole = { user: 'user', admin: 'admin' } as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const UserStatus = { active: 'active', blocked: 'blocked' } as const
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus]

export const ContactType = { email: 'email', phone: 'phone' } as const
export type ContactType = (typeof ContactType)[keyof typeof ContactType]
