import { ROLES } from '@/models/user/constant'
import type { User } from '@/models/user/type'

// A body that names an account. The guards trust the API's answer, not the page, so a response
// that is not shaped like one reads as a visitor.
export function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'role' in value &&
    typeof value.role === 'string' &&
    ROLES.includes(value.role)
  )
}
