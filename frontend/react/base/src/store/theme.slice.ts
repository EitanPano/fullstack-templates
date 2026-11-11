import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Theme } from '@/core/theme/theme'

// The theme choice is client-only state that the theme menu and the toaster both read. The DOM
// and storage side effects are a listener (store/listeners.ts), not a reducer.
type ThemeState = { choice: Theme }

const initialState: ThemeState = { choice: 'system' }

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    // The user picked a theme: persisted by the listener.
    themeChanged(state, action: PayloadAction<Theme>) {
      state.choice = action.payload
    },
    // Boot read the stored choice or the brand default: applied, never written back, so a default
    // the visitor did not pick does not become their stored choice.
    themeRestored(state, action: PayloadAction<Theme>) {
      state.choice = action.payload
    },
  },
  selectors: {
    selectTheme: (state) => state.choice,
  },
})

export const { themeChanged, themeRestored } = themeSlice.actions
export const { selectTheme } = themeSlice.selectors
