// One entry of the primary navigation. `labelKey` is a key of the copy table; `roles` (server auth)
// limits the entry to those roles.
export interface NavEntry {
  path: string
  labelKey: string
  roles?: string[]
}
