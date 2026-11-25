import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROTOCOL_VERSION } from '../../src/protocol'
import { createFrameRenderer, type FrameRendererOptions } from '../../src/ui'

// What the module gives the renderer (its name and a title), and what the renderer says on the
// way out.
const v = PROTOCOL_VERSION
const options = (extra: Partial<FrameRendererOptions> = {}): FrameRendererOptions => ({
  apiOrigin: 'https://api.example.test',
  key: 'pk_a',
  major: 1,
  theme: {},
  module: 'unit',
  title: 'A unit',
  onEvent: vi.fn(),
  ...extra,
})

afterEach(() => document.body.replaceChildren())

describe('renderer options', () => {
  it('titles the iframe with the module title and names the module in the address', () => {
    const target = document.body.appendChild(document.createElement('div'))
    createFrameRenderer(options()).mount(target)
    const iframe = target.querySelector('iframe') as HTMLIFrameElement
    expect(iframe.getAttribute('title')).toBe('A unit')
    expect(new URL(iframe.getAttribute('src') as string).searchParams.get('m')).toBe('unit')
  })

  it.each([
    ['an empty title', { title: ' ' }],
    ['no module name', { module: '' }],
    ['a module name that is not a name', { module: 'Not A Name' }],
  ])('refuses %s and draws nothing', (_name, extra) => {
    const target = document.body.appendChild(document.createElement('div'))
    expect(() => createFrameRenderer(options(extra)).mount(target)).toThrow()
    expect(target.children).toHaveLength(0)
  })

  it('sends destroy over the channel before it removes the container', () => {
    const target = document.body.appendChild(document.createElement('div'))
    const renderer = createFrameRenderer(options())
    const Original = MessageChannel
    const sent: unknown[] = []
    vi.stubGlobal(
      'MessageChannel',
      class extends Original {
        constructor() {
          super()
          const post = this.port1.postMessage.bind(this.port1)
          this.port1.postMessage = (message: unknown) => {
            sent.push({ message, attached: target.querySelector('iframe') !== null })
            post(message)
          }
        }
      },
    )
    renderer.mount(target)
    const iframe = target.querySelector('iframe') as HTMLIFrameElement
    vi.spyOn(iframe.contentWindow as Window, 'postMessage').mockImplementation(() => undefined)
    iframe.dispatchEvent(new Event('load'))
    renderer.destroy()
    expect(sent).toEqual([{ message: { v, type: 'destroy' }, attached: true }])
    vi.unstubAllGlobals()
  })
})
