import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { getApiUserMeOptions } from '@/shared/api/generated/@tanstack/react-query.gen'

import type { Role } from './session'

// Hides a control from an account without the role. It is a convenience, not a guard: the
// loader's `requireRole` keeps the route and the API checks every call.
export function RequireRole({
  role,
  children,
  fallback = null,
}: {
  role: Role
  children: ReactNode
  fallback?: ReactNode
}) {
  const { data } = useQuery({ ...getApiUserMeOptions(), retry: false })
  return data?.role === role ? children : fallback
}
