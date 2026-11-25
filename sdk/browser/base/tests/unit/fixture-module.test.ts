import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSdk, type SdkEvent } from '../../src/core'
import { runFrame } from '../../src/frame'
import { fixtureFrame } from '../e2e/fixture-module/frame'
import { fixtureHost } from '../e2e/fixture-module/host'
import { fixtureModalFrame } from '../e2e/fixture-module/modal-frame'
import { fixtureModalHost } from '../e2e/fixture-module/modal-host'

import { installDialog, installIntersection } from './helpers'

// The fixture module is a feature with both halves, declared on the real kernel without a line of
// the kernel changing. Here the two halves run in one jsdom window, joined the way a browser joins
// them: the handshake the loader posts to the iframe is delivered to the frame's window.
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
  vi.useRealTimers()
})

async function start(props: Record<string, unknown> = {}) {
  const sdk = createSdk({
    modules: [fixtureHost],
    fetch: vi.fn(async () => json({ enabled: true })) as unknown as typeof fetch,
    retries: 0,
  })
  const events: SdkEvent[] = []
  for (const name of ['rendered', 'closed', 'error', 'fixture:viewed', 'fixture:clicked']) {
    sdk.on(name, (event) => events.push(event))
  }
  sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, theme: { scheme: 'dark' } })
  await sdk.whenSettled()
  const unit = sdk.mount('fixture', document.querySelector('[data-slot]') as Element, props)
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
  return { sdk, unit, events, iframe }
}

const block = () => document.querySelector('[data-fixture-block]') as HTMLElement

describe('fixture module on the real kernel', () => {
  it('draws in the frame and tells the host, once the handshake is answered', async () => {
    const { events, iframe, unit } = await start({
      text: 'A sample unit',
      href: 'https://example.test/page',
    })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    expect(events[0]).toEqual({ name: 'rendered', module: 'fixture', unit: unit.id })
    // Its fixed styles are in frame.css: the block carries no inline style of its own.
    expect(block().getAttribute('style')).toBeNull()
    expect(block().textContent).toContain('A sample unit')
    const link = block().querySelector('a') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('https://example.test/page')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
    expect(iframe.getAttribute('title')).toBe('Fixture unit')
  })

  it('draws a string with markup as text and refuses a link that is not https', async () => {
    const { events } = await start({
      text: '<img src=x onerror=alert(1)>',
      href: 'javascript:alert(1)',
    })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    expect(block().querySelector('img')).toBeNull()
    expect(block().querySelector('a')).toBeNull()
    expect(block().textContent).toContain('<img src=x onerror=alert(1)>')
  })

  it('draws an empty state when it has nothing to show', async () => {
    const { events } = await start({})
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    expect(block().querySelector('[data-fixture-empty]')?.textContent).toBe('Nothing to show yet')
    expect(block().querySelector('a')).toBeNull()
  })

  it('draws an image through createImage: its own origin passes, another http origin does not', async () => {
    const { events } = await start({ image: '/api/sdk/fixture.png' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    const img = block().querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(new URL('/api/sdk/fixture.png', document.baseURI).href)
    expect(img.getAttribute('alt')).toBe('')
    expect(block().querySelector('[data-fixture-empty]')).toBeNull()
    stopFrame()
    document.body.replaceChildren()
    document.body.appendChild(document.createElement('div')).setAttribute('data-slot', '')
    const second = await start({ image: 'http://images.example.test/a.png' })
    await vi.waitFor(() => expect(second.events.map((e) => e.name)).toContain('rendered'))
    expect(block().querySelector('img')).toBeNull()
  })

  it('names the props it received, so a spec can tell none else crossed', async () => {
    const { events } = await start({ text: 'x', image: '/a.png' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    expect(block().getAttribute('data-fixture-props')).toBe('image,text')
  })

  it('reports a click as fixture:clicked', async () => {
    const { events } = await start({ text: 'x', href: 'https://example.test/page' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    ;(block().querySelector('a') as HTMLAnchorElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('fixture:clicked'))
  })

  it('asks the host to close the unit from its own button', async () => {
    const { events } = await start({ closable: true })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    ;(block().querySelector('[data-fixture-close]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ name: 'closed', reason: 'frame' }))
  })

  it('fails when the props say so: module_failed, then closed with failed', async () => {
    const { events } = await start({ fail: true })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('closed'))
    expect(events.map((event) => event.code ?? event.reason ?? event.name)).toEqual([
      'module_failed',
      'failed',
    ])
  })

  it('reports a view as fixture:viewed, with the check that ran', async () => {
    const io = installIntersection(true)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { events } = await start({ text: 'x' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    io.current().fire({ intersectionRatio: 1, isVisible: true })
    vi.advanceTimersByTime(1000)
    await vi.waitFor(() =>
      expect(events.find((event) => event.name === 'fixture:viewed')?.data).toEqual({
        occlusion: 'checked',
      }),
    )
  })

  it('draws again when the host updates the props', async () => {
    const { events, unit } = await start({ text: 'first' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    unit.update({ text: 'second' })
    await vi.waitFor(() => expect(block().textContent).toBe('second'))
  })

  it('closes when the host closes it, and the iframe leaves the page', async () => {
    const { events, unit } = await start({ text: 'x' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    unit.close()
    expect(document.querySelector('iframe')).toBeNull()
    expect(events.at(-1)).toMatchObject({ name: 'closed', reason: 'host' })
  })

  it('reports bad_target when the host has no place for the unit', async () => {
    const sdk = createSdk({
      modules: [fixtureHost],
      fetch: vi.fn(async () => json({ enabled: true })) as unknown as typeof fetch,
      retries: 0,
    })
    const seen: Array<string | undefined> = []
    sdk.on('error', (event) => seen.push(event.code))
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.mount('fixture', document.querySelector('[data-missing]') as never)
    await Promise.resolve()
    expect(seen).toEqual(['bad_target'])
    expect(document.querySelectorAll('iframe')).toHaveLength(0)
  })

  it('labels its link with the camelCase prop linkLabel, which a slot reads from data-link-label', async () => {
    const { events } = await start({ href: 'https://example.test/page', linkLabel: 'Read more' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    expect(block().querySelector('a')?.textContent).toBe('Read more')
    expect(fixtureHost.slot?.props).toContain('linkLabel')
  })

  it('calls only a path it holds itself, picked by name from its props', async () => {
    const fetchImpl = vi.fn(async () => json({ enabled: true }))
    vi.stubGlobal('fetch', fetchImpl)
    const { events } = await start({ call: 'config' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    await vi.waitFor(() =>
      expect(block().getAttribute('data-fixture-answer')).toBe('{"enabled":true}'),
    )
    const urls = (fetchImpl.mock.calls as unknown as Array<[string]>).map((call) => call[0])
    expect(urls).toEqual([`${window.location.origin}/api/sdk/v1/config`])
    vi.unstubAllGlobals()
  })

  it.each([
    ['a path of the API', { call: '/api/sdk/v1/config' }],
    ['another origin', { call: 'https://elsewhere.example.test/api/sdk/v1/config' }],
    ['the old prop name', { ask: '/api/sdk/v1/config' }],
    ['a name it does not hold', { call: 'nothing' }],
    ['an inherited name', { call: 'constructor' }],
  ])('makes no request for %s', async (_name, props) => {
    const fetchImpl = vi.fn(async () => json({ enabled: true }))
    vi.stubGlobal('fetch', fetchImpl)
    const { events } = await start(props)
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    await new Promise((resolve) => setTimeout(resolve, 20))
    const urls = (fetchImpl.mock.calls as unknown as Array<[string]>).map((call) => call[0])
    expect(urls).toEqual([])
    expect(block().getAttribute('data-fixture-answer')).toBeNull()
    vi.unstubAllGlobals()
  })
})

describe('the modal fixture on the real kernel', () => {
  let page: ReturnType<typeof installDialog>
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })

  async function open() {
    window.history.replaceState({}, '', '/api/sdk/frame/v1?k=pk_a&m=fixture-modal')
    page = installDialog()
    const sdk = createSdk({
      modules: [fixtureModalHost],
      fetch: vi.fn(async () => json({ enabled: true })) as unknown as typeof fetch,
      retries: 0,
    })
    const events: SdkEvent[] = []
    for (const name of ['rendered', 'closed', 'error', 'fixture-modal:submitted']) {
      sdk.on(name, (event) => events.push(event))
    }
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    sdk.open('fixture-modal')
    const iframe = page.iframe()
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
    stopFrame = runFrame({ win: window, modules: [fixtureModalFrame] }).stop
    iframe.dispatchEvent(new Event('load'))
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('rendered'))
    const form = document.querySelector('form') as HTMLFormElement
    const field = form.querySelector('input') as HTMLInputElement
    return { events, form, field }
  }

  it('draws a labelled required field, opens the dialog first and focuses the field', async () => {
    const { field } = await open()
    expect(page.order).toEqual(['showModal', 'start'])
    expect(document.querySelector('[data-fixture-modal-panel] h2')?.textContent).toBe(
      'Fixture dialog',
    )
    expect(document.querySelector(`label[for="${field.id}"]`)).not.toBeNull()
    expect(field.required).toBe(true)
    // The module validates, the same in every engine: the browser's own bubble is off.
    expect(field.form?.noValidate).toBe(true)
    expect(field.hasAttribute('aria-describedby')).toBe(false)
    expect(document.documentElement.getAttribute('data-display')).toBe('modal')
    expect(document.activeElement).toBe(field)
  })

  it('stops an empty submit with the field marked invalid, and sends nothing', async () => {
    const { events, form, field } = await open()
    form.requestSubmit()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(field.getAttribute('aria-invalid')).toBe('true')
    expect(field.getAttribute('aria-describedby')).toBe('fixture-modal-error')
    expect((document.getElementById('fixture-modal-error') as HTMLElement).hidden).toBe(false)
    expect(document.activeElement).toBe(field)
    field.value = 'a'
    field.dispatchEvent(new Event('input'))
    expect(field.hasAttribute('aria-invalid')).toBe(false)
    expect(field.hasAttribute('aria-describedby')).toBe(false)
    expect(events.map((event) => event.name)).toEqual(['rendered'])
  })

  it('reports submitted, then closes with frame, on a valid submit', async () => {
    const { events, form, field } = await open()
    field.value = 'an answer'
    form.requestSubmit()
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('closed'))
    expect(events.map((event) => event.name)).toEqual([
      'rendered',
      'fixture-modal:submitted',
      'closed',
    ])
    expect(events.at(-1)?.reason).toBe('frame')
  })

  it('closes with frame from its close button', async () => {
    const { events } = await open()
    ;(document.querySelector('[data-fixture-modal-close]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(events.at(-1)).toMatchObject({ name: 'closed', reason: 'frame' }))
  })
})
