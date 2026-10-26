import type { NextRequest } from 'next/server'

import { refreshSession } from '@/shared/auth/refresh'

// Keeps the session alive: an expired access token is refreshed here, before the page renders,
// because a Server Component cannot set cookies. This file never decides who may see what; that
// is `requireAccount` and `requireRole` in the page or loader.
export function proxy(request: NextRequest) {
  return refreshSession(request)
}

export const config = {
  // Pages and actions; not static assets, images or files with an extension.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
