import { runFrame } from '../frame'

// The script of the frame document (frame.html). No module ships, so it only answers the
// handshake, reports the size and meters the empty mount.
if (typeof window !== 'undefined') runFrame({ win: window, modules: [] })
