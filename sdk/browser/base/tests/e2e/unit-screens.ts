import type { Frame } from '@playwright/test'

/**
 * Every screen of the package: one unit of a module, in a state a visitor can see. The screens
 * spec shows each on a host page, in light and dark and at two widths, and checks what the unit
 * draws. Add an entry for each state of each module a project adds (a filled one, an empty one,
 * an error one); the fixtures' are the template's own.
 */
export type UnitScreen = {
  /** File name of the screenshot and the name in a failure. Lowercase, `-` between words. */
  name: string
  module: string
  /** `inline` units are mounted, `modal` ones are opened; the module declares which. */
  display: 'inline' | 'modal'
  props: Record<string, unknown>
  /** What a visitor does in the frame before the screen is taken (a state only an action reaches). */
  steps?: (frame: Frame) => Promise<void>
}

export const unitScreens: UnitScreen[] = [
  {
    name: 'fixture-filled',
    module: 'fixture',
    display: 'inline',
    props: { text: 'A fixture unit with a short text', href: 'https://example.test/page' },
  },
  { name: 'fixture-empty', module: 'fixture', display: 'inline', props: {} },
  { name: 'fixture-modal', module: 'fixture-modal', display: 'modal', props: {} },
  {
    name: 'fixture-modal-invalid',
    module: 'fixture-modal',
    display: 'modal',
    props: {},
    // An empty submit: the module stops it, and the field and its own error line say so.
    steps: async (frame) => {
      await frame.locator('button[type="submit"]').click()
      await frame.locator('input[aria-invalid="true"]').waitFor()
    },
  },
]
