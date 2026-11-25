import type { ModuleDeclaration } from '../../../src/core'

/**
 * The modal fixture's host half, for tests only: a declaration. It has no slot (a modal module
 * has none) and no placeholder height (there is no inline place to hold).
 */
export const fixtureModalHost: ModuleDeclaration = {
  name: 'fixture-modal',
  title: 'Fixture dialog',
  display: 'modal',
}
