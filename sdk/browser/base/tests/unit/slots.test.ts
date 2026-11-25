import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, type ModuleDeclaration, type SdkDeps, type SdkEvent } from '../../src/core'

import { connectFrame } from './helpers'

const ORIGIN = 'https://api.example.test'
const ATTRIBUTE = 'data-test-sdk'
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const probe: ModuleDeclaration = {
  name: 'probe',
  title: 'Probe unit',
  slot: { props: ['label', 'size', 'itemId'] },
}
const modalSlot: ModuleDeclaration = {
  name: 'probe-modal',
  title: 'Modal probe',
  display: 'modal',
  slot: { props: [] },
}
const noSlot: ModuleDeclaration = { name: 'plain', title: 'Plain unit' }

function make(deps: Partial<SdkDeps> = {}, enabled = true) {
  const sdk = createSdk({
    modules: [probe, modalSlot, noSlot],
    slotAttribute: ATTRIBUTE,
    fetch: vi.fn(async () => json({ enabled })) as unknown as typeof fetch,
    retries: 0,
    handshakeTimeoutMs: 1000,
    ...deps,
  })
  const events: SdkEvent[] = []
  for (const name of ['closed', 'error']) sdk.on(name, (event) => events.push(event))
  return { sdk, events }
}

const slot = (
  module: string,
  data: Record<string, string> = {},
  parent: Element = document.body,
) => {
  const el = parent.appendChild(document.createElement('div'))
  el.setAttribute(ATTRIBUTE, module)
  for (const [name, value] of Object.entries(data)) el.setAttribute(`data-${name}`, value)
  return el
}

const iframes = () => [...document.querySelectorAll('iframe')]

async function boot(
  options: { observe?: boolean } = {},
  deps: Partial<SdkDeps> = {},
  enabled = true,
) {
  const made = make(deps, enabled)
  made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, ...options })
  await made.sdk.whenSettled()
  return made
}

// A MutationObserver the test drives by hand: jsdom's own fires on a microtask.
type Created = {
  callback: MutationCallback
  target?: Node
  options?: unknown
  disconnected: boolean
}
function stubObserver() {
  const created: Created[] = []
  class Observer {
    handle: Created
    constructor(callback: MutationCallback) {
      this.handle = { callback, disconnected: false }
      created.push(this.handle)
    }
    observe(target: Node, options?: unknown) {
      this.handle.target = target
      this.handle.options = options
    }
    disconnect() {
      this.handle.disconnected = true
    }
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal('MutationObserver', Observer)
  return created
}

const mutation = (added: Node[], removed: Node[] = []) =>
  [{ type: 'childList', addedNodes: added, removedNodes: removed }] as unknown as MutationRecord[]
const fire = (observer: Created | undefined, added: Node[], removed: Node[] = []) =>
  observer?.callback(mutation(added, removed), {} as MutationObserver)

const setReadyState = (state: DocumentReadyState) =>
  Object.defineProperty(document, 'readyState', { value: state, configurable: true })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  setReadyState('complete')
  document.body.replaceChildren()
})

describe('slots', () => {
  it('mounts a slot with only the props its module lists', async () => {
    const el = slot('probe', { label: 'Hello', size: 'm', secret: 'no', 'other-thing': 'x' })
    await boot()
    expect(iframes()).toHaveLength(1)
    expect(el.querySelector('iframe')).not.toBeNull()
    const frame = connectFrame(iframes()[0] as HTMLIFrameElement)
    await frame.ready()
    expect(frame.received.find((m) => m['type'] === 'start')?.['props']).toEqual({
      label: 'Hello',
      size: 'm',
    })
  })

  it('leaves out a listed prop the element does not have', async () => {
    slot('probe', { label: 'Hello' })
    await boot()
    const frame = connectFrame(iframes()[0] as HTMLIFrameElement)
    await frame.ready()
    expect(frame.received.find((m) => m['type'] === 'start')?.['props']).toEqual({
      label: 'Hello',
    })
  })

  it('mounts two slots, each once', async () => {
    slot('probe', { label: 'a' })
    slot('probe', { label: 'b' })
    await boot()
    expect(iframes()).toHaveLength(2)
  })

  it('mounts nothing on a second scan and writes nothing on the host element', async () => {
    const el = slot('probe', { label: 'a' })
    const attributes = el.getAttributeNames()
    const created = stubObserver()
    await boot({ observe: true })
    expect(iframes()).toHaveLength(1)
    fire(created[0], [el])
    expect(iframes()).toHaveLength(1)
    expect(el.getAttributeNames()).toEqual(attributes)
  })

  it('does not mount a slot whose unit has closed on a later scan', async () => {
    const el = slot('probe')
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    const frame = connectFrame(iframes()[0] as HTMLIFrameElement)
    frame.say({ type: 'close' })
    await vi.waitFor(() => expect(events.some((event) => event.reason === 'frame')).toBe(true))
    expect(iframes()).toHaveLength(0)
    fire(created[0], [el])
    expect(iframes()).toHaveLength(0)
  })

  it.each([
    ['an unknown module', 'nope'],
    ['a module with no slot', 'plain'],
    ['a modal module', 'probe-modal'],
  ])('reports bad_slot for %s and mounts nothing', async (_label, name) => {
    slot(name)
    const { events } = await boot()
    expect(iframes()).toHaveLength(0)
    expect(events).toEqual([{ name: 'error', code: 'bad_slot', module: name }])
  })

  it('reports bad_slot without a module when the value is not a name', async () => {
    slot('Not A Name!')
    const { events } = await boot()
    expect(events).toEqual([{ name: 'error', code: 'bad_slot' }])
  })

  it('reports a bad slot once, however often it is scanned', async () => {
    const el = slot('')
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    fire(created[0], [el])
    expect(events.filter((event) => event.code === 'bad_slot')).toHaveLength(1)
  })

  it('scans nothing before the kill switch has answered', async () => {
    slot('probe')
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    expect(iframes()).toHaveLength(0)
    await sdk.whenSettled()
    expect(iframes()).toHaveLength(1)
  })

  it('scans nothing and watches nothing when the switch says disabled', async () => {
    slot('probe')
    const created = stubObserver()
    const { events } = await boot({ observe: true }, {}, false)
    expect(iframes()).toHaveLength(0)
    expect(created).toHaveLength(0)
    expect(events).toEqual([])
  })

  it('scans nothing when the SDK was built with no slot attribute', async () => {
    slot('probe')
    await boot({}, { slotAttribute: undefined })
    expect(iframes()).toHaveLength(0)
  })

  it('scans again on DOMContentLoaded when the document was still loading', async () => {
    setReadyState('loading')
    await boot()
    expect(iframes()).toHaveLength(0)
    slot('probe')
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(iframes()).toHaveLength(1)
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(iframes()).toHaveLength(1)
  })

  it('adds no listener when the document has loaded', async () => {
    const add = vi.spyOn(document, 'addEventListener')
    await boot()
    expect(add.mock.calls.map((call) => call[0])).not.toContain('DOMContentLoaded')
  })

  it('removes its DOMContentLoaded listener when it fires', async () => {
    setReadyState('loading')
    const remove = vi.spyOn(document, 'removeEventListener')
    await boot()
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(remove.mock.calls.map((call) => call[0])).toContain('DOMContentLoaded')
  })

  it('removes its DOMContentLoaded listener on destroy', async () => {
    setReadyState('loading')
    const { sdk } = await boot()
    sdk.destroy()
    slot('probe')
    document.dispatchEvent(new Event('DOMContentLoaded'))
    expect(iframes()).toHaveLength(0)
  })
})

describe('the slot observer', () => {
  it('creates no MutationObserver unless observe is true', async () => {
    const created = stubObserver()
    slot('probe')
    await boot()
    expect(created).toHaveLength(0)
  })

  it.each([false, 'yes', 1])('ignores observe: %j', async (observe) => {
    const created = stubObserver()
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, observe } as never)
    await sdk.whenSettled()
    expect(created).toHaveLength(0)
  })

  it('watches the document element, from the moment the switch says enabled', async () => {
    const created = stubObserver()
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN, observe: true })
    expect(created).toHaveLength(0)
    await sdk.whenSettled()
    expect(created).toHaveLength(1)
    expect(created[0]?.target).toBe(document.documentElement)
    expect(created[0]?.options).toEqual({ childList: true, subtree: true })
  })

  it('mounts a slot added later, the node itself or inside a subtree', async () => {
    const created = stubObserver()
    await boot({ observe: true })
    const own = slot('probe', { label: 'own' })
    const wrapper = document.body.appendChild(document.createElement('section'))
    slot('probe', { label: 'inner' }, wrapper)
    fire(created[0], [own, wrapper, document.createTextNode('x')])
    expect(iframes()).toHaveLength(2)
  })

  it('closes the unit of a slot that left the document, with slot_removed', async () => {
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    const el = slot('probe')
    fire(created[0], [el])
    expect(iframes()).toHaveLength(1)
    el.remove()
    fire(created[0], [], [el])
    expect(iframes()).toHaveLength(0)
    expect(events).toEqual([
      { name: 'closed', module: 'probe', unit: 'u1', reason: 'slot_removed' },
    ])
  })

  it('mounts a slot again when its element is removed and added back', async () => {
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    const el = slot('probe')
    fire(created[0], [el])
    el.remove()
    fire(created[0], [], [el])
    expect(iframes()).toHaveLength(0)
    document.body.appendChild(el)
    fire(created[0], [el])
    expect(iframes()).toHaveLength(1)
    expect(events.map((event) => event.reason ?? event.name)).toEqual(['slot_removed'])
  })

  it('does not mount a slot again when its unit failed, so a bad module is no loop', async () => {
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    const el = slot('probe')
    fire(created[0], [el])
    const frame = connectFrame(iframes()[0] as HTMLIFrameElement)
    frame.say({ type: 'error', code: 'module_failed' })
    await vi.waitFor(() => expect(events.some((event) => event.reason === 'failed')).toBe(true))
    el.remove()
    fire(created[0], [], [el])
    document.body.appendChild(el)
    fire(created[0], [el])
    expect(iframes()).toHaveLength(0)
    expect(events.map((event) => event.reason ?? event.code)).toEqual(['module_failed', 'failed'])
  })

  it('closes a unit whose slot sat inside a removed subtree', async () => {
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    const wrapper = document.body.appendChild(document.createElement('section'))
    slot('probe', {}, wrapper)
    fire(created[0], [wrapper])
    wrapper.remove()
    fire(created[0], [], [wrapper])
    expect(events.map((event) => event.reason)).toEqual(['slot_removed'])
  })

  it('keeps a unit whose slot is still in the document', async () => {
    const created = stubObserver()
    const { events } = await boot({ observe: true })
    const el = slot('probe')
    fire(created[0], [el])
    fire(created[0], [], [document.createElement('i')])
    expect(events).toEqual([])
    expect(iframes()).toHaveLength(1)
  })

  it('disconnects on destroy', async () => {
    const created = stubObserver()
    const { sdk } = await boot({ observe: true })
    sdk.destroy()
    expect(created[0]?.disconnected).toBe(true)
  })

  it('works with the real MutationObserver', async () => {
    const { sdk } = await boot({ observe: true })
    const added = slot('probe')
    await vi.waitFor(() => expect(iframes()).toHaveLength(1))
    added.remove()
    await vi.waitFor(() => expect(iframes()).toHaveLength(0))
    sdk.destroy()
  })
})

describe('the names a slot lists', () => {
  it('reads a camelCase name from the kebab-case attribute: itemId is data-item-id', async () => {
    slot('probe', { 'item-id': '42', itemid: 'not this one' })
    await boot()
    const frame = connectFrame(iframes()[0] as HTMLIFrameElement)
    await frame.ready()
    expect(frame.received.find((m) => m['type'] === 'start')?.['props']).toEqual({ itemId: '42' })
  })

  it.each(['item-id', 'Item', '1st', 'a b', '', 'item_id'])(
    'reports bad_slot, and mounts nothing, for a module that lists %j',
    async (name) => {
      slot('listing', { text: 'x' })
      const { events } = await boot(
        {},
        { modules: [{ name: 'listing', title: 'Listing', slot: { props: ['text', name] } }] },
      )
      expect(iframes()).toHaveLength(0)
      expect(events).toEqual([{ name: 'error', code: 'bad_slot', module: 'listing' }])
    },
  )
})

describe('how many units one instance holds', () => {
  it('mounts 50 slots and refuses the 51st with too_many_units', async () => {
    for (let n = 0; n < 51; n += 1) slot('probe')
    const { events } = await boot()
    expect(iframes()).toHaveLength(50)
    await vi.waitFor(() =>
      expect(events).toEqual([
        { name: 'error', code: 'too_many_units', module: 'probe', unit: 'u51' },
      ]),
    )
  })

  it('counts the units mounted by hand with those of the slots', async () => {
    for (let n = 0; n < 2; n += 1) slot('probe')
    const { sdk, events } = await boot()
    const place = document.body.appendChild(document.createElement('div'))
    for (let n = 0; n < 48; n += 1) sdk.mount('probe', place)
    expect(iframes()).toHaveLength(50)
    const extra = sdk.mount('probe', place)
    await vi.waitFor(() =>
      expect(events).toEqual([
        { name: 'error', code: 'too_many_units', module: 'probe', unit: extra.id },
      ]),
    )
    expect(iframes()).toHaveLength(50)
  })
})

describe('an Object.prototype polluted by the host page', () => {
  const polluted: string[] = []
  const pollute = (name: string, value: unknown) => {
    Object.defineProperty(Object.prototype, name, { value, configurable: true, writable: true })
    polluted.push(name)
  }
  afterEach(() => {
    for (const name of polluted.splice(0))
      delete (Object.prototype as Record<string, unknown>)[name]
  })

  it('does not make a module a slot module', async () => {
    pollute('slot', { props: ['label'] })
    slot('plain', { label: 'x' })
    const { events } = await boot()
    expect(iframes()).toHaveLength(0)
    expect(events).toEqual([{ name: 'error', code: 'bad_slot', module: 'plain' }])
  })

  it('does not make a slot module modal', async () => {
    pollute('display', 'modal')
    slot('probe')
    await boot()
    expect(iframes()).toHaveLength(1)
  })

  it('does not turn the observer on', async () => {
    pollute('observe', true)
    const created = stubObserver()
    const { sdk } = make()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(created).toHaveLength(0)
  })
})
