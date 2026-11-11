// One entry of the nav table (app/nav.ts). `roles` limits the entry to accounts holding one of
// them; without it every visitor sees it.
export interface NavEntry {
  path: string
  labelKey: string
  roles?: readonly string[]
}
