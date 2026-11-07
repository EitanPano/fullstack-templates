import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { AppProviders } from '@/app/providers'
import { createRoutes } from '@/app/routes'
import { createStore, type AppStore } from '@/store'

// The app's route table in a memory router against a fresh store, whatever API the test stubbed.
// Pass a store to preload state; the returned `store` is the one the page uses.
export function renderRoutes({
  initialEntries = ['/'],
  store = createStore(),
}: { initialEntries?: string[]; store?: AppStore } = {}) {
  const router = createMemoryRouter(createRoutes(store), { initialEntries })
  const view = render(
    <AppProviders store={store}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { store, router, ...view }
}
