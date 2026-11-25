import type { ModuleDeclaration } from '../core'

// The one list of host-side declarations: entries/index and entries/cdn both pass it to the
// kernel. A module adds its `modules/<name>/host` here, and its frame half to frame-modules.ts.
// No module ships.
export const hostModules: ModuleDeclaration[] = []
