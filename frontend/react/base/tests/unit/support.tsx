import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { vi } from 'vitest'

import { ThemeProvider } from '@/shared/ui/theme-provider'

// A client like the app's, but with no stale time: a test reads what it just stubbed.
export function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
}

// Shows where the router is, so a test can assert a navigation.
export function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{`${pathname}${search}`}</p>
}

export function renderApp(
  ui: ReactElement,
  { route = '/', client = createTestClient() }: { route?: string; client?: QueryClient } = {},
) {
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ThemeProvider defaultTheme="system">
          <MemoryRouter initialEntries={[route]}>
            {ui}
            <Where />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>,
    ),
  }
}

type Handler = Response | (() => Response | Promise<Response>)

// A fake API on the global fetch, keyed `METHOD /path`. The generated client builds a Request and
// calls the global fetch, so this is the one boundary tests fake. Unlisted calls answer 404.
export function stubApi(routes: Record<string, Handler>) {
  const fetchMock = vi.fn((input: Request) => {
    const key = `${input.method} ${new URL(input.url).pathname}`
    const handler = routes[key]
    if (handler === undefined) {
      return Promise.resolve(
        Response.json({ error: { code: 'not_found', message: 'x' } }, { status: 404 }),
      )
    }
    return Promise.resolve(typeof handler === 'function' ? handler() : handler.clone())
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export const envelope = (code: string, status: number) =>
  Response.json({ error: { code, message: 'server text: hunter2' }, requestId: 'r1' }, { status })

export const USER = {
  id: 'u1',
  email: 'ada@example.com',
  phone: null,
  role: 'user' as const,
  status: 'active' as const,
  emailVerifiedAt: null,
  phoneVerifiedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

export const SESSION = {
  user: USER,
  tokens: {
    accessToken: 'a',
    accessExpiresAt: '2030-01-01T00:00:00.000Z',
    refreshToken: 'r',
    refreshExpiresAt: '2030-02-01T00:00:00.000Z',
  },
}
