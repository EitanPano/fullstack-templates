import { runFrame } from '../frame'

import { frameModules } from './frame-modules'

// The script of the frame document (frame.html). It serves the modules of the list; with none it
// only answers the handshake.
if (typeof window !== 'undefined') runFrame({ win: window, modules: frameModules })
