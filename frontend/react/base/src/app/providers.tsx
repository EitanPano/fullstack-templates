import { Tooltip } from 'radix-ui'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'

import { Toaster } from '@/shared/components/toaster'
import type { AppStore } from '@/store'
import { useAppSelector } from '@/store/hooks'
import { selectTheme } from '@/store/theme.slice'

// The toaster follows the theme slice, so it sits inside the store provider.
function ThemedToaster() {
  return <Toaster theme={useAppSelector(selectTheme)} />
}

// Everything every route shares: the store, tooltips and the toaster. The router goes inside.
export function AppProviders({ store, children }: { store: AppStore; children: ReactNode }) {
  return (
    <Provider store={store}>
      <Tooltip.Provider>{children}</Tooltip.Provider>
      <ThemedToaster />
    </Provider>
  )
}
