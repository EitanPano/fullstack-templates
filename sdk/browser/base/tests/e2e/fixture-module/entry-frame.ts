import { runFrame } from '../../../src/frame'

import { fixtureFrame } from './frame'

runFrame({ win: window, modules: [fixtureFrame] })
