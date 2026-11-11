import type { ReactNode } from 'react'
import { Provider } from 'react-redux'

import { Toaster } from '@/shared/components/toaster/toaster'
import { TooltipProvider } from '@/shared/components/tooltip/tooltip'
import type { AppStore } from '@/store'
import { useAppSelector } from '@/store/hooks'
import { selectTheme } from '@/store/theme.slice'

// The toaster follows the theme slice, so it sits inside the store provider; shared/ gets the
// choice as a prop and never reads the store.
function ConnectedToaster() {
  return <Toaster theme={useAppSelector(selectTheme)} />
}

// Everything every route shares: the store, tooltips and the toaster. The router goes inside.
export function AppProviders({ store, children }: { store: AppStore; children: ReactNode }) {
  return (
    <Provider store={store}>
      <TooltipProvider>
        {children}
        <ConnectedToaster />
      </TooltipProvider>
    </Provider>
  )
}
