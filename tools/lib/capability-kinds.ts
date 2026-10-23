// A leaf: it imports nothing from lib/, so catalog.ts and capabilities.ts can both read the
// kinds as values without an import cycle.
export type CapabilityKind = 'database' | 'cache' | 'messaging'

export const CAPABILITY_KINDS: readonly CapabilityKind[] = ['database', 'cache', 'messaging']

export const isKind = (name: string): name is CapabilityKind =>
  (CAPABILITY_KINDS as readonly string[]).includes(name)
