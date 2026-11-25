import type { FrameModule } from '../frame'

// The one list of frame halves: entries/frame and the e2e build both pass it to the frame. A
// module adds its `modules/<name>/frame` here, and its host half to entries/host-modules.ts.
// No module ships.
export const frameModules: FrameModule[] = []
