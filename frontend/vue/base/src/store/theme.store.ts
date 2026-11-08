import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'

import { storage } from '@/core/providers/storage'
import {
  applyTheme,
  readStoredTheme,
  resolveTheme,
  watchSystemTheme,
  type ThemeChoice,
} from '@/core/providers/theme'
import { STORAGE_KEYS } from '@/core/config/constants'

const ORDER: readonly ThemeChoice[] = ['light', 'dark', 'system']

// The theme choice (light, dark or system), persisted, and the theme it resolves to. A watcher
// writes <html data-theme> and the theme-color metas; public/theme-init.js set the first value
// before paint. While the choice is system the store follows the OS.
export const useThemeStore = defineStore('theme', () => {
  const choice = ref<ThemeChoice>(readStoredTheme())
  const systemDark = ref(resolveTheme('system') === 'dark')
  const resolved = computed(() => {
    if (choice.value === 'system') return systemDark.value ? 'dark' : 'light'
    return choice.value
  })

  watch(resolved, applyTheme, { immediate: true })
  onScopeDispose(
    watchSystemTheme((dark) => {
      systemDark.value = dark
    }),
  )

  function set(next: ThemeChoice): void {
    choice.value = next
    storage.set(STORAGE_KEYS.theme, next)
  }

  // light, then dark, then system, then light again.
  function cycle(): void {
    const next = ORDER[(ORDER.indexOf(choice.value) + 1) % ORDER.length]
    if (next) set(next)
  }

  return { choice, resolved, set, cycle }
})
