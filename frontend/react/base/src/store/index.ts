import { combineReducers, configureStore } from '@reduxjs/toolkit'

import { env } from '@/core/config/env'
import { api } from '@/services/api'
import { createListeners } from '@/store/listeners'
import { themeSlice } from '@/store/theme.slice'

// RootState comes from the combined reducer, not from the store, so `createStore` can name it in
// its own signature.
const rootReducer = combineReducers({
  [api.reducerPath]: api.reducer,
  theme: themeSlice.reducer,
})
export type RootState = ReturnType<typeof rootReducer>

// One store per page (main.tsx) and one per test (renderRoutes), so no module holds a singleton.
// `setupListeners` is not used: no refetch on focus or reconnect unless a plan turns it on.
export function createStore(preloaded?: Partial<RootState>) {
  const listeners = createListeners()
  return configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().prepend(listeners.middleware).concat(api.middleware),
    preloadedState: preloaded,
    // The DevTools extension would otherwise see every action's arguments, a sign-in password
    // included; only a development build connects to it.
    devTools: env.MODE !== 'production',
  })
}

export type AppStore = ReturnType<typeof createStore>
export type AppDispatch = AppStore['dispatch']
