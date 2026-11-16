// constant.ts belongs: the copy of the kit (labels a component writes itself). One language, one
// table: a product that needs more swaps it for its own i18n. It does not belong: the error
// messages (models/error/constant.ts) or a page's own text.
export const UI_COPY = {
  skipToContent: 'Skip to content',
  loading: 'Loading',
  dismiss: 'Dismiss',
  notifications: 'Notifications',
  themeToggle: (current: string, next: string) => `Theme: ${current}. Switch to ${next}`,
  themeCurrent: (current: string) => `Theme: ${current}`,
} as const
