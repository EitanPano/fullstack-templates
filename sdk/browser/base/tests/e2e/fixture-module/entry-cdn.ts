import { bootCdn } from '../../../src/core'
import { GLOBAL_NAME } from '../../../src/entries/global-name'

import { fixtureHost } from './host'

// The loader of the e2e build: the real kernel and entry helper with the fixture module
// registered. It draws into the first element with `data-sdk-slot` on the host page.
bootCdn({
  modules: [
    fixtureHost({
      target: () => document.querySelector('[data-sdk-slot]'),
      text: 'Fixture unit',
      href: 'https://example.test/offer',
    }),
  ],
  globalName: GLOBAL_NAME,
})
