import type { ApiError } from '@/models/api/type'

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' && value !== null && 'code' in value && typeof value.code === 'string'
  )
}

// The belt for a store method that awaited a facade: an ApiError passes, a thrown fetch is a
// network failure, anything else is unknown.
export function toApiError(cause: unknown, context?: string): ApiError {
  if (isApiError(cause)) return cause
  const where = context === undefined ? {} : { context }
  if (cause instanceof TypeError) return { code: 'network', ...where }
  return { code: 'unknown', ...where }
}
