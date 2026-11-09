import type { Component } from 'vue'

import AccountMenu from './account-menu.vue' // @server:auth
import InstallButton from './install-button.vue' // @pwa
import LanguageToggle from './language-toggle.vue' // @i18n

// The one file the generator resolves for the header's optional parts. Each function answers the
// component to render, or null; the header renders nothing for null. A flag adds its component
// on a marked first return (the account menu with auth, the language toggle with i18n, the
// install button with pwa) and the `@no` twin keeps the null; `no-unreachable` is off for this
// file because the second return is dead code in place, on purpose. Until a flag lands, null.
export function accountSlot(): Component | null {
  return AccountMenu // @server:auth
  return null
}

export function languageToggle(): Component | null {
  return LanguageToggle // @i18n
  return null
}

export function installButton(): Component | null {
  return InstallButton // @pwa
  return null
}
