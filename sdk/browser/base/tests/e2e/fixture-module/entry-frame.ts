import { frameModules } from '../../../src/entries/frame-modules'
import { runFrame } from '../../../src/frame'

import { fixtureFrame } from './frame'
import { fixtureModalFrame } from './modal-frame'

// The fixtures, then the modules of the real build: a module added there is in the e2e build too.
runFrame({ win: window, modules: [fixtureFrame, fixtureModalFrame, ...frameModules] })
