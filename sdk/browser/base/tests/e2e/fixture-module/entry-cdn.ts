import { bootCdn } from '../../../src/core'
import { GLOBAL_NAME, SLOT_ATTRIBUTE } from '../../../src/entries/global-name'
import { hostModules } from '../../../src/entries/host-modules'

import { fixtureHost } from './host'
import { fixtureModalHost } from './modal-host'

// The loader of the e2e build: the real kernel and entry helper with the two fixture modules
// declared, and the modules of the real build after it. It mounts nothing itself: a spec calls
// `mount` or `open`.
bootCdn({
  modules: [fixtureHost, fixtureModalHost, ...hostModules],
  globalName: GLOBAL_NAME,
  slotAttribute: SLOT_ATTRIBUTE,
})
