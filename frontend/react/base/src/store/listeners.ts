import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'

import { applyTheme, watchSystemTheme } from '@/core/theme/theme'
import { themeChanged, themeRestored } from '@/store/theme.slice'

// A side effect of a slice action lives here. One listener per store, so a test's fresh store
// owns its own OS watcher, which runs only while the choice is `system`.
export function createListeners() {
  const listener = createListenerMiddleware()
  let unwatch: (() => void) | undefined

  listener.startListening({
    predicate: isAnyOf(themeChanged, themeRestored),
    effect: (action) => {
      // isAnyOf leaves the action unknown here; the guards narrow it to the payload we read.
      const restored = themeRestored.match(action)
      if (!restored && !themeChanged.match(action)) return
      applyTheme(action.payload, { persist: !restored })
      unwatch?.()
      unwatch =
        action.payload === 'system'
          ? watchSystemTheme(() => {
              applyTheme('system')
            })
          : undefined
    },
  })

  return listener
}
