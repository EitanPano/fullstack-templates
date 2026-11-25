import { major, type HostModule } from '../../../src/core'
import { createFrameRenderer } from '../../../src/ui'

export type FixtureOptions = {
  /** Where the unit goes on the host page. */
  target: () => Element | null
  text?: string
  href?: string
}

/**
 * A feature's host half, for tests only (it lives outside src/, so no build ships it). It draws
 * through the frame renderer and tells the frame what to show once the channel is open.
 */
export function fixtureHost(options: FixtureOptions): HostModule {
  return {
    name: 'fixture',
    start(ctx) {
      const target = options.target()
      if (!target) throw new Error('fixture: no element to draw into')
      const renderer = createFrameRenderer({
        apiOrigin: ctx.apiOrigin,
        key: ctx.key,
        major,
        theme: ctx.theme,
        placeholderHeight: 120,
        onEvent: ({ name, occlusion, message }) =>
          ctx.emit({
            name,
            ...(occlusion ? { occlusion } : {}),
            ...(message ? { message } : {}),
          }),
        onReady() {
          renderer.setConsent(ctx.consent())
          renderer.sendModule('fixture', { text: options.text ?? '', href: options.href ?? '' })
        },
      })
      renderer.mount(target)
      const stopConsent = ctx.onConsent((state) => renderer.setConsent(state))
      return () => {
        stopConsent()
        renderer.destroy()
      }
    },
  }
}
