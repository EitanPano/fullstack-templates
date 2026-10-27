import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { createRoutes } from '@/app/routes'
import { ThemeProvider } from '@/shared/ui/theme-provider'

import { createTestClient } from './support'

// The app's route table in a memory router, against whatever API the test stubbed.
export function renderRoutes(path: string) {
  const client = createTestClient()
  const router = createMemoryRouter(createRoutes(client), { initialEntries: [path] })
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider defaultTheme="system">
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return router
}
