import type { NextRequest } from 'next/server'

import { refreshSession } from '@/shared/auth/refresh'

// Keeps the session alive: an expired access token is refreshed here, before the page renders,
// because a Server Component cannot set cookies. This file never decides who may see what; that
// is `requireAccount` and `requireRole` in the page or loader.
export function proxy(request: NextRequest) {
  return refreshSession(request)
}

export const config = {
  // Pages and actions; not Next's own assets or static files. A dot alone does not exclude a
  // path, because a product route can hold one (`/user/jane.doe`, `/release/v1.2`) and must
  // keep its session refresh. Add an extension here when `public/` serves a new kind of file.
  matcher: [
    '/((?!_next/|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$|.*\\.(?:avif|css|gif|ico|jpe?g|js|map|png|svg|txt|webmanifest|webp|woff2?|xml)$).*)',
  ],
}
