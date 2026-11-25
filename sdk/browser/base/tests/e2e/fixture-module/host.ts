import type { ModuleDeclaration } from '../../../src/core'

/**
 * A feature's host half, for tests only (it lives outside src/, so no build ships it): a
 * declaration and nothing else. Its slot lists five props (`linkLabel` is read from
 * `data-link-label`), so any other `data-` attribute of
 * an element stays on the page. The placeholder is not the block's own height, so a test can tell
 * the frame's report from the placeholder.
 */
export const fixtureHost: ModuleDeclaration = {
  name: 'fixture',
  title: 'Fixture unit',
  placeholderHeight: 60,
  slot: { props: ['text', 'href', 'image', 'call', 'linkLabel'] },
}
