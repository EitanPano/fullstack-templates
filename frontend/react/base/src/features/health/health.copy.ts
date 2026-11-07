// The refresh's user-facing copy. The failure description is a hint; the title is the ApiError's
// own message, so the toast never shows server text.
export const REFRESH_COPY = {
  success: 'Status refreshed',
  failureHint: 'Start the API and try again.',
} as const
