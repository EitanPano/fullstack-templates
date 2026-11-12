// First, so the validation library is configured (jitless, our messages) before any schema is built.
import '@/shared/utils/validation'
import '@fontsource-variable/inter'
import '@/styles/themes/brand.css'
import '@/styles/styles.scss'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'

import { AppProviders } from '@/app/providers'
import { createRoutes } from '@/app/routes'
import { readStoredTheme, toTheme } from '@/core/theme/theme'
import { createStore } from '@/store'
import { themeRestored } from '@/store/theme.slice'

// After a redeploy, an open tab asks for a chunk the new image no longer has and the dynamic import
// fails. Reloading picks up the new index and its chunk names.
window.addEventListener('vite:preloadError', () => {
  window.location.reload()
})

const root = document.getElementById('root')
if (!root) throw new Error('index.html has no #root element')

// The one store and router for the page. The initial theme goes through the listener that writes
// data-theme, but as `themeRestored`, which never writes storage.
const store = createStore()
store.dispatch(themeRestored(readStoredTheme(toTheme('__THEME_DEFAULT__'))))
const router = createBrowserRouter(createRoutes(store))

createRoot(root).render(
  <StrictMode>
    <AppProviders store={store}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)
