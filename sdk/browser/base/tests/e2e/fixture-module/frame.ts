import {
  appendText,
  createImage,
  createLink,
  observeView,
  type FrameModule,
} from '../../../src/frame'

// A request goes to a path this module holds, picked by name: a path taken from a prop would let
// the page make the frame call any endpoint of its origin. `outside` and `elsewhere` are refused.
const CALLS: Record<string, string> = {
  config: '/api/sdk/v1/config',
  outside: '/api/health',
  elsewhere: '@elsewhere.example.test/api/sdk/v1/config',
}

/**
 * The same feature's frame half: a block with a text, an https link and an image, styled by its
 * `frame.css`. Everything comes from the props, so it is treated as untrusted. It reports a view
 * and a click as events of its own, draws again when the props change, has an empty state, can ask to be closed and can fail on
 * purpose.
 */
export const fixtureFrame: FrameModule = {
  name: 'fixture',
  start(ctx) {
    // A unit that fails to start: the kernel reports `module_failed` and closes it.
    if (ctx.props().fail === true) throw new Error('fixture failure')
    const doc = ctx.mount.ownerDocument
    const block = doc.createElement('div')
    block.setAttribute('data-fixture-block', '')
    ctx.mount.appendChild(block)

    const draw = (props: Record<string, unknown>) => {
      const { text, href, call, linkLabel, image, closable } = props
      // What crossed the channel, for a spec that checks no other attribute of the slot did.
      block.setAttribute('data-fixture-props', Object.keys(props).sort().join(','))
      // A call to the frame's own origin, when the props name one of the calls above: the answer,
      // or the fixed code of the refusal, is left on the block for a test to read.
      if (typeof call === 'string' && Object.hasOwn(CALLS, call)) {
        void ctx.request(CALLS[call] as string).then(
          (answer) => block.setAttribute('data-fixture-answer', JSON.stringify(answer)),
          (error: unknown) =>
            block.setAttribute('data-fixture-answer', error instanceof Error ? error.message : ''),
        )
      }
      block.replaceChildren()
      if (typeof text === 'string' && text) {
        const paragraph = doc.createElement('p')
        appendText(paragraph, text)
        block.appendChild(paragraph)
      }
      const link =
        typeof href === 'string'
          ? createLink(
              doc,
              href,
              typeof linkLabel === 'string' && linkLabel ? linkLabel : 'Learn more',
            )
          : null
      if (link) {
        link.addEventListener('click', () => ctx.emit('clicked'))
        block.appendChild(link)
      }
      const picture = typeof image === 'string' ? createImage(doc, image, '') : null
      if (picture) {
        picture.setAttribute('data-fixture-image', '')
        block.appendChild(picture)
      }
      if (closable === true) {
        const button = doc.createElement('button')
        button.setAttribute('type', 'button')
        button.setAttribute('data-fixture-close', '')
        appendText(button, 'Close')
        button.addEventListener('click', () => ctx.close())
        block.appendChild(button)
      }
      if (block.childElementCount === 0) {
        const empty = doc.createElement('p')
        empty.setAttribute('data-fixture-empty', '')
        appendText(empty, 'Nothing to show yet')
        block.appendChild(empty)
      }
    }

    draw(ctx.props())
    ctx.onProps(draw)
    // Sent once consent allows: the frame holds it until the host has granted.
    ctx.track({ name: 'rendered' })
    observeView(block, {
      ratio: 0.5,
      dwellMs: 1000,
      onView: (occlusion) => ctx.emit('viewed', { occlusion }),
    })
  },
}
