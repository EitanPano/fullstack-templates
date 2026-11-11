import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter, useLocation } from 'react-router'

import { TooltipProvider } from '@/shared/components/tooltip/tooltip'
import { createStore, type AppStore } from '@/store'

// Shows where the router is, so a test can assert a navigation.
function Where() {
  const { pathname, search } = useLocation()
  return <p data-testid="where">{`${pathname}${search}`}</p>
}

// One component under the store, tooltips and a memory router, for a test that needs the router
// context but not the route table (a form, the account menu). No Toaster: a test that asserts a
// toast mocks sonner, and the mock has no component to render.
export function renderInRouter(
  ui: ReactElement,
  { route = '/', store = createStore() }: { route?: string; store?: AppStore } = {},
) {
  return {
    store,
    ...render(
      <Provider store={store}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[route]}>
            {ui}
            <Where />
          </MemoryRouter>
        </TooltipProvider>
      </Provider>,
    ),
  }
}
