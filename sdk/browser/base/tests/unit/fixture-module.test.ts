import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSdk } from '../../src/core'
import { runFrame } from '../../src/frame'
import { fixtureFrame } from '../e2e/fixture-module/frame'
import { fixtureHost } from '../e2e/fixture-module/host'

// The fixture module is a feature with both halves, registered on the real kernel without a line
// of the kernel changing. Here the two halves run in one jsdom window, joined the way a browser
// joins them: the handshake the loader posts to the iframe is delivered to the frame's window.
const ORIGIN = 'https://api.example.test'

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

let stopFrame: () => void = () => undefined

beforeEach(() => {
  window.history.replaceState({}, '', '/api/sdk/frame/v1?k=pk_a&m=fixture')
  document.body.replaceChildren()
  document.body.appendChild(document.createElement('div')).setAttribute('data-slot', '')
})

afterEach(() => {
  stopFrame()
})

async function start(host: Partial<Parameters<typeof fixtureHost>[0]> = {}) {
  const sdk = createSdk({
    modules: [fixtureHost({ target: () => document.querySelector('[data-slot]'), ...host })],
    fetch: vi.fn(async () => json({ enabled: true })) as unknown as typeof fetch,
    retries: 0,
  })
  const events: string[] = []
  for (const name of ['rendered', 'clicked', 'error'] as const) {
    sdk.on(name, (event) => events.push(`${event.name}${event.message ? `:${event.message}` : ''}`))
  }
  sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, theme: { scheme: 'dark' } })
  await sdk.whenSettled()
  const iframe = document.querySelector('iframe') as HTMLIFrameElement
  // The loader posts the handshake to the iframe's window; deliver it to the frame running here.
  vi.spyOn(iframe.contentWindow as Window, 'postMessage').mockImplementation(
    (message: unknown, _origin: unknown, transfer?: unknown) => {
      const event = new MessageEvent('message', {
        data: message,
        origin: 'https://host.example.test',
        source: window,
      })
      Object.defineProperty(event, 'ports', { value: transfer })
      window.dispatchEvent(event)
    },
  )
  stopFrame = runFrame({ win: window, modules: [fixtureFrame] }).stop
  iframe.dispatchEvent(new Event('load'))
  return { sdk, events, iframe }
}

describe('fixture module on the real kernel', () => {
  it('draws in the frame and tells the host, once the handshake is answered', async () => {
    const { events, iframe } = await start({
      text: 'A sample unit',
      href: 'https://example.test/offer',
    })
    await vi.waitFor(() => expect(events).toContain('rendered'))
    const block = document.querySelector('[data-fixture-block]') as HTMLElement
    expect(block.style.getPropertyValue('height')).toBe('120px')
    expect(block.textContent).toContain('A sample unit')
    const link = block.querySelector('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.test/offer')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
  })

  it('draws a host string with markup as text and refuses a link that is not https', async () => {
    const { events } = await start({
      text: '<img src=x onerror=alert(1)>',
      href: 'javascript:alert(1)',
    })
    await vi.waitFor(() => expect(events).toContain('rendered'))
    const block = document.querySelector('[data-fixture-block]') as HTMLElement
    expect(block.querySelector('img')).toBeNull()
    expect(block.querySelector('a')).toBeNull()
    expect(block.textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('tells the host about a click', async () => {
    const { events } = await start({ text: 'x', href: 'https://example.test/offer' })
    await vi.waitFor(() => expect(events).toContain('rendered'))
    ;(document.querySelector('[data-fixture-block] a') as HTMLAnchorElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(events).toContain('clicked'))
  })

  it('reports an error event when the host has no place for the unit', async () => {
    document.body.replaceChildren()
    const sdk = createSdk({
      modules: [fixtureHost({ target: () => document.querySelector('[data-slot]') })],
      fetch: vi.fn(async () => json({ enabled: true })) as unknown as typeof fetch,
      retries: 0,
    })
    const seen: string[] = []
    sdk.on('error', (event) => seen.push(event.message ?? ''))
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(seen).toEqual(['fixture: no element to draw into'])
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })
})
