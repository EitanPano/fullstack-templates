import { afterEach, describe, expect, it, vi } from 'vitest'

import { HANDSHAKE_KIND, PROTOCOL_VERSION } from '../../src/protocol'
import { createFrameRenderer, type FrameRendererOptions } from '../../src/ui'

const ORIGIN = 'https://api.example.test'
const v = PROTOCOL_VERSION

const make = (extra: Partial<FrameRendererOptions> = {}) => {
  const onEvent = vi.fn()
  const onCollapse = vi.fn()
  const renderer = createFrameRenderer({
    apiOrigin: ORIGIN,
    key: 'pk_a',
    major: 1,
    theme: { scheme: 'dark', accent: '#0a0' },
    placeholderHeight: 120,
    handshakeTimeoutMs: 1000,
    onEvent,
    onCollapse,
    ...extra,
  })
  const target = document.body.appendChild(document.createElement('div'))
  renderer.mount(target)
  const iframe = target.querySelector('iframe') as HTMLIFrameElement
  const post = vi.spyOn(iframe.contentWindow as Window, 'postMessage')
  return { renderer, target, iframe, post, onEvent, onCollapse }
}

const loadFrame = (iframe: HTMLIFrameElement) => iframe.dispatchEvent(new Event('load'))
const portOf = (post: ReturnType<typeof vi.spyOn>, call = 0) =>
  ((post.mock.calls[call] as unknown[])[2] as MessagePort[])[0] as MessagePort

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('frame renderer', () => {
  // A browser found this: an iframe put in the page without an address fires `load` for its empty
  // document first (WebKit), and the handshake sent to it was refused with a console error.
  it('puts the iframe in the page with its sandbox and address already set', () => {
    const target = document.body.appendChild(document.createElement('div'))
    const attributes: Array<[string | null, string | null]> = []
    vi.spyOn(target, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
      const frame = (node as unknown as Element).querySelector('iframe')
      attributes.push([frame?.getAttribute('sandbox') ?? null, frame?.getAttribute('src') ?? null])
      return Node.prototype.appendChild.call(target, node) as T
    })
    createFrameRenderer({
      apiOrigin: ORIGIN,
      key: 'pk_a',
      major: 1,
      theme: {},
      onEvent: vi.fn(),
    }).mount(target)
    expect(attributes).toHaveLength(1)
    expect(attributes[0]?.[0]).toContain('allow-scripts')
    expect(attributes[0]?.[1]).toContain('/api/sdk/frame/v1')
  })

  it('adds one container with one iframe, sandboxed, from the API origin', () => {
    const { target, iframe } = make()
    expect(target.children).toHaveLength(1)
    expect(target.firstElementChild?.children).toHaveLength(1)
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    )
    expect(iframe.getAttribute('sandbox')).not.toContain('top-navigation')
    const src = new URL(iframe.getAttribute('src') as string)
    expect(src.origin).toBe(ORIGIN)
    expect(src.pathname).toBe('/api/sdk/frame/v1')
    expect(src.searchParams.get('k')).toBe('pk_a')
    expect(src.searchParams.get('scheme')).toBe('dark')
    expect(src.searchParams.get('accent')).toBe('#0a0')
  })

  it('never writes a style attribute: it uses the CSSOM', () => {
    const attributes = vi.spyOn(Element.prototype, 'setAttribute')
    const { iframe, target } = make()
    expect(attributes.mock.calls.map((call) => call[0])).not.toContain('style')
    expect(iframe.style.getPropertyValue('height')).toBe('120px')
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('height')).toBe('120px')
  })

  it('opens the handshake to the exact origin of the frame, on every load', () => {
    const { iframe, post } = make()
    loadFrame(iframe)
    expect(post).toHaveBeenCalledTimes(1)
    const [message, targetOrigin, transfer] = post.mock.calls[0] as unknown as [
      unknown,
      string,
      unknown[],
    ]
    expect(message).toEqual({ kind: HANDSHAKE_KIND, v })
    expect(targetOrigin).toBe(ORIGIN)
    expect(transfer).toHaveLength(1)
    expect(transfer[0]).toBeInstanceOf(MessagePort)

    loadFrame(iframe)
    expect(post).toHaveBeenCalledTimes(2)
    expect(portOf(post, 1)).not.toBe(portOf(post, 0))
  })

  it('sets the height the frame reports, through the CSSOM', async () => {
    const { iframe, post, target } = make()
    loadFrame(iframe)
    portOf(post).postMessage({ v, type: 'ready' })
    portOf(post).postMessage({ v, type: 'size', height: 188 })
    await vi.waitFor(() => expect(iframe.style.getPropertyValue('height')).toBe('188px'))
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('height')).toBe('188px')
  })

  it('passes the events of the frame on, and ignores a malformed message', async () => {
    const { iframe, post, onEvent } = make()
    loadFrame(iframe)
    const port = portOf(post)
    port.postMessage({ v, type: 'ready' })
    port.postMessage({ v, type: 'bogus' })
    port.postMessage('text')
    port.postMessage({ v, type: 'event', name: 'viewed', occlusion: 'checked' })
    await vi.waitFor(() => expect(onEvent).toHaveBeenCalledTimes(1))
    expect(onEvent).toHaveBeenCalledWith({
      v,
      type: 'event',
      name: 'viewed',
      occlusion: 'checked',
    })
  })

  it('collapses the container when no answer comes, and reports nothing', () => {
    vi.useFakeTimers()
    const { iframe, target, onEvent, onCollapse } = make()
    loadFrame(iframe)
    vi.advanceTimersByTime(1000)
    const container = target.firstElementChild as HTMLElement
    expect(container.style.getPropertyValue('display')).toBe('none')
    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('does not read the load event as an answer', () => {
    vi.useFakeTimers()
    const { iframe, target } = make()
    loadFrame(iframe)
    vi.advanceTimersByTime(500)
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('display')).not.toBe(
      'none',
    )
    vi.advanceTimersByTime(600)
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('display')).toBe('none')
  })

  it('keeps the container when the frame answers in time', async () => {
    const { iframe, target, post } = make({ handshakeTimeoutMs: 50 })
    loadFrame(iframe)
    portOf(post).postMessage({ v, type: 'ready' })
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('display')).not.toBe(
      'none',
    )
  })

  it('is undone by destroy', () => {
    const { renderer, target } = make()
    renderer.destroy()
    expect(target.children).toHaveLength(0)
  })

  it('sends a theme change over the channel', async () => {
    const { renderer, iframe, post } = make()
    loadFrame(iframe)
    const port = portOf(post)
    const received: unknown[] = []
    port.onmessage = (event) => received.push(event.data)
    renderer.setTheme({ scheme: 'light' })
    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0]).toEqual({ v, type: 'theme', theme: { scheme: 'light' } })
  })
})
