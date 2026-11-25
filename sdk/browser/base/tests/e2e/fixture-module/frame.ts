import { appendText, createLink, type FrameModule } from '../../../src/frame'

const HEIGHT = '120px'

/**
 * The same feature's frame half: a block of fixed height with a text and an https link. The
 * text and the address come from the host, so they are treated as untrusted.
 */
export const fixtureFrame: FrameModule = {
  name: 'fixture',
  start(ctx) {
    const doc = ctx.mount.ownerDocument
    const block = doc.createElement('div')
    block.setAttribute('data-fixture-block', '')
    block.style.setProperty('height', HEIGHT)
    block.style.setProperty('font-family', 'var(--sdk-font, system-ui, sans-serif)')
    block.style.setProperty('color', 'var(--sdk-text, inherit)')
    ctx.mount.appendChild(block)
    ctx.report('rendered')

    ctx.onMessage((payload) => {
      // The host's text arrives after the consent state, so this is sent only once it is granted.
      ctx.track({ name: 'rendered' })
      const { text, href } = (payload ?? {}) as { text?: unknown; href?: unknown }
      block.replaceChildren()
      if (typeof text === 'string' && text) {
        const paragraph = doc.createElement('p')
        paragraph.style.setProperty('margin', '0')
        appendText(paragraph, text)
        block.appendChild(paragraph)
      }
      const link = typeof href === 'string' ? createLink(doc, href, 'Learn more') : null
      if (link) {
        link.addEventListener('click', () => ctx.report('clicked'))
        block.appendChild(link)
      }
    })
  },
}
