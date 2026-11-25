import { bootCdn } from '../core'

import { GLOBAL_NAME, SLOT_ATTRIBUTE } from './global-name'
import { hostModules } from './host-modules'

// The CDN loader: one IIFE, one global, with the modules this build declares.
bootCdn({ modules: hostModules, globalName: GLOBAL_NAME, slotAttribute: SLOT_ATTRIBUTE })
