import { bootCdn } from '../core'

import { GLOBAL_NAME } from './global-name'

// The CDN loader: one IIFE, one global. No module ships, so it only carries the kernel.
bootCdn({ modules: [], globalName: GLOBAL_NAME })
