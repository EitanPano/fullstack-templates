import type { ApiError, CopyTable, WithCopyOptions } from '@/models/api-error/type'

// Words an error in a page's own copy; this is the one home of error copy beyond the defaults
// in `services/call.ts`. The page that shows the error knows its situation (a wrong password,
// a taken email), so it applies its table here and says which codes belong to a form field. Pure:
// the error it is given is not changed.
export function withCopy(
  error: ApiError,
  copy: CopyTable,
  { fields = {}, discriminator }: WithCopyOptions = {},
): ApiError {
  const second = discriminator?.(error)
  const message =
    (second === undefined ? undefined : copy[`${error.code}:${second}`]) ??
    copy[error.code] ??
    error.message
  const fieldErrors = new Map(
    Object.entries(error.fieldErrors ?? {}).map(([path, text]) => [
      path,
      copy[`${error.code}:${path}`] ?? copy[error.code] ?? text,
    ]),
  )
  const field = error.code === 'network' ? undefined : fields[error.code]
  if (field !== undefined) fieldErrors.set(field, message)
  return {
    ...error,
    message,
    ...(fieldErrors.size > 0 ? { fieldErrors: Object.fromEntries(fieldErrors) } : {}),
  }
}
