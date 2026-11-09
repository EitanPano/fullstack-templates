import { describe, expect, it } from 'vitest'

import AccountMenu from './account-menu.vue' // @server:auth
import InstallButton from './install-button.vue' // @pwa
import LanguageToggle from './language-toggle.vue' // @i18n
import { accountSlot, installButton, languageToggle } from './slots'
import slotsSource from './slots.ts?raw'

// The body of each exported function in `slots.ts`, up to the next one.
function bodies() {
  return slotsSource
    .split(/^export function /m)
    .slice(1)
    .map((chunk) => ({ name: chunk.slice(0, chunk.indexOf('(')), body: chunk }))
}

describe('slots', () => {
  it('answers a component, or null while its flag is off, never undefined', () => {
    for (const slot of [accountSlot(), languageToggle(), installButton()]) {
      expect(slot === null || typeof slot === 'object').toBe(true)
    }
  })

  it('ends every function on the null fallback the header treats as "render nothing"', () => {
    const found = bodies()

    expect(found.map(({ name }) => name)).toEqual([
      'accountSlot',
      'languageToggle',
      'installButton',
    ])
    for (const { body } of found) {
      expect(body.trimEnd().endsWith('return null\n}')).toBe(true)
    }
  })

  // @server:auth-start
  it('answers the account menu while auth is on, above the null fallback', () => {
    expect(accountSlot()).toBe(AccountMenu)
    expect(bodies()[0]?.body.match(/^\s+return /gm)).toHaveLength(2)
  })
  // @server:auth-end

  // @i18n-start
  it('answers the language toggle while i18n is on, above the null fallback', () => {
    expect(languageToggle()).toBe(LanguageToggle)
    expect(bodies()[1]?.body.match(/^\s+return /gm)).toHaveLength(2)
  })
  // @i18n-end

  // @pwa-start
  it('answers the install button while pwa is on, above the null fallback', () => {
    expect(installButton()).toBe(InstallButton)
    expect(bodies()[2]?.body.match(/^\s+return /gm)).toHaveLength(2)
  })
  // @pwa-end
})
