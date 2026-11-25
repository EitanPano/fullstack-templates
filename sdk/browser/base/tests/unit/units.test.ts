import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSdk, type ModuleDeclaration, type SdkDeps, type SdkEvent } from '../../src/core'

import { connectFrame, installDialog, type DialogHandle, type FakeFrame } from './helpers'

const ORIGIN = 'https://api.example.test'
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const probe: ModuleDeclaration = { name: 'probe', title: 'Probe unit', placeholderHeight: 90 }
const modal: ModuleDeclaration = { name: 'probe-modal', title: 'Modal probe', display: 'modal' }

// The read of the kill switch answers when the test says so: what a unit does while it waits.
function deferredRead() {
  let answer: (response: Response) => void = () => undefined
  let fail: (error: Error) => void = () => undefined
  const fetchImpl = vi.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        answer = resolve
        fail = reject
      }),
  )
  return {
    fetchImpl: fetchImpl as unknown as typeof fetch,
    answer: (response: Response) => answer(response),
    fail: (error: Error) => fail(error),
  }
}

function make(deps: Partial<SdkDeps> = {}) {
  const sdk = createSdk({
    modules: [probe, modal],
    fetch: vi.fn(async () => json({ enabled: true })) as unknown as typeof fetch,
    retries: 0,
    retryDelayMs: 0,
    handshakeTimeoutMs: 1000,
    ...deps,
  })
  const events: SdkEvent[] = []
  for (const name of ['rendered', 'closed', 'error', 'probe:seen']) {
    sdk.on(name, (event) => events.push(event))
  }
  const names = () => events.map((event) => event.name)
  return { sdk, events, names }
}

async function boot(deps: Partial<SdkDeps> = {}) {
  const made = make(deps)
  made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
  await made.sdk.whenSettled()
  const target = document.body.appendChild(document.createElement('div'))
  return { ...made, target }
}

const iframes = () => [...document.querySelectorAll('iframe')]
// What `mount` reports while it runs reaches the host on a microtask, never before the handle.
const flush = () => Promise.resolve()
const frameAt = (index: number) => connectFrame(iframes()[index] as HTMLIFrameElement)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('a unit on the page', () => {
  it('draws a container and a sandboxed iframe with the module title and address', async () => {
    const { sdk, target } = await boot()
    sdk.setTheme({ scheme: 'dark' })
    const unit = sdk.mount('probe', target, { a: 1 })
    const iframe = target.querySelector('iframe') as HTMLIFrameElement
    expect(unit.id).toBe('u1')
    expect(unit.module).toBe('probe')
    expect(target.children).toHaveLength(1)
    expect(iframe.getAttribute('title')).toBe('Probe unit')
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts')
    expect(iframe.getAttribute('sandbox')).not.toContain('top-navigation')
    const src = new URL(iframe.getAttribute('src') as string)
    expect(src.origin).toBe(ORIGIN)
    expect(src.pathname).toBe('/api/sdk/frame/v1')
    expect([src.searchParams.get('k'), src.searchParams.get('m')]).toEqual(['pk_a', 'probe'])
    expect(src.searchParams.get('scheme')).toBe('dark')
    expect(iframe.style.getPropertyValue('height')).toBe('90px')
  })

  it('sends one start message at ready, with props, consent, theme and display', async () => {
    const { sdk, target } = await boot()
    sdk.setConsent('granted')
    sdk.setTheme({ scheme: 'dark', accent: '#0a0' })
    sdk.mount('probe', target, { text: 'hi' })
    const first = frameAt(0)
    await first.ready()
    expect(first.received).toEqual([
      {
        v: 1,
        type: 'start',
        props: { text: 'hi' },
        consent: 'granted',
        theme: { scheme: 'dark', accent: '#0a0' },
        display: 'inline',
      },
    ])
  })

  it('numbers its units per instance, from u1', async () => {
    const { sdk, target } = await boot()
    expect([sdk.mount('probe', target).id, sdk.mount('probe', target).id]).toEqual(['u1', 'u2'])
    sdk.destroy()
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await sdk.whenSettled()
    expect(sdk.mount('probe', target).id).toBe('u1')
  })

  it('sets the height the frame reports, and reports rendered with the unit and module', async () => {
    const { sdk, target, events } = await boot()
    const unit = sdk.mount('probe', target)
    const iframe = iframes()[0] as HTMLIFrameElement
    const frame = connectFrame(iframe)
    await frame.ready()
    frame.say({ type: 'size', height: 188.2 })
    frame.say({ type: 'rendered' })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(iframe.style.getPropertyValue('height')).toBe('189px')
    expect((target.firstElementChild as HTMLElement).style.getPropertyValue('height')).toBe('189px')
    expect(events[0]).toEqual({ name: 'rendered', module: 'probe', unit: unit.id })
  })

  it('reports an event of the module as <module>:<name> with its data', async () => {
    const { sdk, target, events } = await boot()
    const unit = sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    frame.say({ type: 'emit', name: 'seen', data: { ratio: 1 } })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]).toEqual({
      name: 'probe:seen',
      module: 'probe',
      unit: unit.id,
      data: { ratio: 1 },
    })
  })

  it('drops an emit with a bad name or data over the cap', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    frame.say({ type: 'emit', name: 'Bad Name' })
    frame.say({ type: 'emit', name: 'seen', data: 'x'.repeat(9000) })
    frame.say({ type: 'rendered' })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    expect(events[0]?.name).toBe('rendered')
  })

  it('starts again with the current props when the frame reloads', async () => {
    const { sdk, target } = await boot()
    const unit = sdk.mount('probe', target, { n: 1 })
    const first = frameAt(0)
    await first.ready()
    unit.update({ n: 2 })
    const second = frameAt(0)
    await second.ready()
    expect(second.received[0]).toMatchObject({ type: 'start', props: { n: 2 } })
  })

  it('adds no listener to the page', async () => {
    const onWindow = vi.spyOn(window, 'addEventListener')
    const onDocument = vi.spyOn(document, 'addEventListener')
    const { sdk, target } = await boot()
    sdk.mount('probe', target)
    expect(onWindow).not.toHaveBeenCalled()
    expect(onDocument).not.toHaveBeenCalled()
  })
})

describe('how a unit closes', () => {
  const closed = (events: SdkEvent[]) => events.filter((event) => event.name === 'closed')

  it('closes with host: removes the container, sends the frame nothing, reports once', async () => {
    const { sdk, target, events } = await boot()
    const unit = sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    unit.close()
    unit.close()
    expect(target.children).toHaveLength(0)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(frame.received.map((message) => message['type'])).toEqual(['start'])
    expect(closed(events)).toEqual([
      { name: 'closed', module: 'probe', unit: unit.id, reason: 'host' },
    ])
  })

  it('leaves a closed handle inert', async () => {
    const { sdk, target, events } = await boot()
    const unit = sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    unit.close()
    unit.update({ late: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(frame.received.map((message) => message['type'])).toEqual(['start'])
    expect(events.filter((event) => event.name === 'error')).toEqual([])
  })

  it('closes every unit with host on destroy', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    sdk.mount('probe', target)
    sdk.destroy()
    expect(target.children).toHaveLength(0)
    expect(closed(events).map((event) => event.reason)).toEqual(['host', 'host'])
  })

  it('closes with frame when the frame asks', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    frame.say({ type: 'close' })
    await vi.waitFor(() => expect(closed(events)).toHaveLength(1))
    expect(closed(events)[0]?.reason).toBe('frame')
    expect(target.children).toHaveLength(0)
  })

  it('reports error, then closes with failed, when the frame sends an error', async () => {
    const { sdk, target, events, names } = await boot()
    const unit = sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    frame.say({ type: 'error', code: 'props_too_large' })
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(names()).toEqual(['error', 'closed'])
    expect(events[0]).toEqual({
      name: 'error',
      code: 'props_too_large',
      module: 'probe',
      unit: unit.id,
    })
    expect(events[1]?.reason).toBe('failed')
    expect(target.children).toHaveLength(0)
  })

  it('passes on module_failed for a code that is not a code, never text', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    frame.say({ type: 'error', code: 'tok_SECRET leaked text' })
    await vi.waitFor(() => expect(events).toHaveLength(2))
    expect(events[0]?.code).toBe('module_failed')
    expect(JSON.stringify(events)).not.toContain('SECRET')
  })

  it('closes with timeout when the handshake is not answered, and not when it is', async () => {
    vi.useFakeTimers()
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    sdk.mount('probe', target)
    frameAt(0)
    const answered = frameAt(1)
    answered.say({ type: 'ready' })
    await vi.advanceTimersByTimeAsync(999)
    expect(closed(events)).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2)
    expect(closed(events).map((event) => event.reason)).toEqual(['timeout'])
    expect(iframes()).toHaveLength(1)
  })

  it('does not read the load event as an answer', async () => {
    vi.useFakeTimers()
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    frameAt(0)
    await vi.advanceTimersByTimeAsync(1500)
    expect(closed(events).map((event) => event.reason)).toEqual(['timeout'])
  })

  it('reports an internal error and closes with failed when the declaration cannot draw', async () => {
    const { sdk, target, events } = await boot({ modules: [{ name: 'broken', title: ' ' }] })
    sdk.mount('broken', target)
    await flush()
    expect(events.map((event) => [event.name, event.code ?? event.reason])).toEqual([
      ['error', 'internal'],
      ['closed', 'failed'],
    ])
    expect(target.children).toHaveLength(0)
  })
})

describe('update', () => {
  it('sends the props of a live unit to its frame', async () => {
    const { sdk, target } = await boot()
    const unit = sdk.mount('probe', target, { n: 1 })
    const frame = frameAt(0)
    await frame.ready()
    unit.update({ n: 2 })
    await vi.waitFor(() => expect(frame.received).toHaveLength(2))
    expect(frame.received[1]).toEqual({ v: 1, type: 'props', props: { n: 2 } })
  })

  it('reports bad_props and props_too_large, and keeps the old props', async () => {
    const { sdk, target, events } = await boot()
    const unit = sdk.mount('probe', target, { n: 1 })
    const frame = frameAt(0)
    await frame.ready()
    unit.update([1] as never)
    unit.update({ big: 'x'.repeat(9000) })
    expect(events.map((event) => event.code)).toEqual(['bad_props', 'props_too_large'])
    expect(events[0]).toMatchObject({ module: 'probe', unit: unit.id })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(frame.received).toHaveLength(1)
  })
})

describe('setTheme and setConsent', () => {
  it('reach a live frame, and a unit started later has them in its start message', async () => {
    const { sdk, target } = await boot()
    sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    sdk.setTheme({ scheme: 'light', accent: '#123456', text: 'red; background:url(x)' })
    sdk.setConsent('granted')
    await vi.waitFor(() => expect(frame.received).toHaveLength(3))
    expect(frame.received[1]).toEqual({
      v: 1,
      type: 'theme',
      theme: { scheme: 'light', accent: '#123456' },
    })
    expect(frame.received[2]).toEqual({ v: 1, type: 'consent', state: 'granted' })

    sdk.mount('probe', target)
    const later = frameAt(1)
    await later.ready()
    expect(later.received[0]).toMatchObject({
      consent: 'granted',
      theme: { scheme: 'light', accent: '#123456' },
    })
  })

  it('ignore a value that is not a state or a theme', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    expect(() => sdk.setConsent('maybe' as never)).not.toThrow()
    expect(() => sdk.setTheme(null as never)).not.toThrow()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(frame.received).toHaveLength(1)
    expect(events).toEqual([])
  })
})

describe('a unit mounted before the kill switch is read', () => {
  const start = () => {
    const read = deferredRead()
    const made = make({ fetch: read.fetchImpl })
    made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    const target = document.body.appendChild(document.createElement('div'))
    return { ...made, read, target }
  }

  it('waits, then starts when the switch says enabled; later mounts start at once', async () => {
    const { sdk, read, target } = start()
    sdk.mount('probe', target)
    expect(iframes()).toHaveLength(0)
    read.answer(json({ enabled: true }))
    await sdk.whenSettled()
    expect(iframes()).toHaveLength(1)
    sdk.mount('probe', target)
    expect(iframes()).toHaveLength(2)
  })

  it('takes the props of the last update while it waits', async () => {
    const { sdk, read, target, events } = start()
    const unit = sdk.mount('probe', target, { n: 1 })
    unit.update({ n: 2 })
    unit.update([] as never)
    expect(events.map((event) => event.code)).toEqual(['bad_props'])
    read.answer(json({ enabled: true }))
    await sdk.whenSettled()
    const frame = frameAt(0)
    await frame.ready()
    expect(frame.received[0]).toMatchObject({ props: { n: 2 } })
  })

  it('is cancelled by close: closed with host, and it never starts', async () => {
    const { sdk, read, target, events } = start()
    const unit = sdk.mount('probe', target)
    unit.close()
    read.answer(json({ enabled: true }))
    await sdk.whenSettled()
    expect(iframes()).toHaveLength(0)
    expect(events).toEqual([{ name: 'closed', module: 'probe', unit: unit.id, reason: 'host' }])
  })

  it('is closed with disabled when the switch says disabled, and so is a later mount', async () => {
    const { sdk, read, target, events } = start()
    sdk.mount('probe', target)
    read.answer(json({ enabled: false }))
    await sdk.whenSettled()
    sdk.mount('probe', target)
    await flush()
    expect(iframes()).toHaveLength(0)
    expect(events.map((event) => [event.name, event.reason])).toEqual([
      ['closed', 'disabled'],
      ['closed', 'disabled'],
    ])
  })

  it('is closed with disabled when the read fails, after config_failed once', async () => {
    const { sdk, read, target, events } = start()
    sdk.mount('probe', target)
    sdk.mount('probe', target)
    read.fail(new TypeError('network'))
    await sdk.whenSettled()
    expect(events.map((event) => event.code ?? event.reason)).toEqual([
      'config_failed',
      'disabled',
      'disabled',
    ])
  })

  it('holds 50 units and refuses the 51st with too_many_units and an inert handle', async () => {
    const { sdk, target, events } = start()
    for (let n = 0; n < 50; n += 1) sdk.mount('probe', target)
    await flush()
    expect(events).toEqual([])
    const extra = sdk.mount('probe', target)
    await flush()
    expect(events).toEqual([
      { name: 'error', code: 'too_many_units', module: 'probe', unit: extra.id },
    ])
    expect(() => {
      extra.update({})
      extra.close()
    }).not.toThrow()
  })

  it('closes a waiting unit with host on destroy, and drops the late answer', async () => {
    const { sdk, read, target, events } = start()
    sdk.mount('probe', target)
    sdk.destroy()
    read.answer(json({ enabled: true }))
    await sdk.whenSettled()
    expect(iframes()).toHaveLength(0)
    expect(events.map((event) => event.reason)).toEqual(['host'])
  })
})

describe('mount never throws and always returns a handle', () => {
  it('reports not_initialised before init', async () => {
    const { sdk, events } = make()
    const unit = sdk.mount('probe', document.body)
    expect(events).toEqual([])
    await flush()
    expect(events).toEqual([
      { name: 'error', code: 'not_initialised', module: 'probe', unit: unit.id },
    ])
    expect(() => {
      unit.update({})
      unit.close()
    }).not.toThrow()
    expect(iframes()).toHaveLength(0)
  })

  it.each([
    ['unknown_module', ['nope', 'target']],
    ['unknown_module', [42, 'target']],
    ['bad_target', ['probe', null]],
    ['bad_target', ['probe', '#slot']],
    ['bad_target', ['probe', { appendChild: 1 }]],
    ['bad_props', ['probe', 'target', [1]]],
    ['bad_props', ['probe', 'target', 'text']],
    ['bad_props', ['probe', 'target', { n: 1n }]],
    ['props_too_large', ['probe', 'target', { a: 'x'.repeat(9000) }]],
  ])('reports %s and returns an inert handle', async (code, args) => {
    const { sdk, target, events } = await boot()
    const [module, where, props] = args as [unknown, unknown, unknown]
    const unit = sdk.mount(
      module as never,
      (where === 'target' ? target : where) as never,
      props as never,
    )
    expect(events).toEqual([])
    await flush()
    expect(events.map((event) => event.code)).toEqual([code])
    expect(events[0]?.unit).toBe(unit.id)
    expect(() => {
      unit.update({ a: 1 })
      unit.close()
    }).not.toThrow()
    expect(iframes()).toHaveLength(0)
    expect(events).toHaveLength(1)
  })
})

describe('on', () => {
  it('takes <module>:<event>, and returns the unsubscribe', async () => {
    const { sdk, target } = await boot()
    const seen = vi.fn()
    const off = sdk.on('probe:thing', seen)
    sdk.mount('probe', target)
    const frame = frameAt(0)
    await frame.ready()
    frame.say({ type: 'emit', name: 'thing' })
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1))
    off()
    frame.say({ type: 'emit', name: 'thing' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it.each([
    'viewed',
    'nope',
    'Probe:seen',
    'probe:Seen',
    'probe:',
    ':seen',
    'a:b:c',
    '',
    `${'x'.repeat(41)}:a`,
  ])('returns a no-op unsubscribe for %j', (name) => {
    const { sdk } = make()
    const handler = vi.fn()
    const off = sdk.on(name, handler)
    expect(typeof off).toBe('function')
    expect(() => off()).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })
})

describe("the order of a unit's events", () => {
  it('fires nothing before mount has returned the handle: a refusal comes on a microtask', async () => {
    const { sdk, target, events } = await boot()
    const seen: string[] = []
    sdk.on('error', () => seen.push('event'))
    const unit = sdk.mount('nope', target)
    seen.push('handle')
    await flush()
    expect(seen).toEqual(['handle', 'event'])
    expect(events[0]?.unit).toBe(unit.id)
  })

  it('reports closed with disabled on a microtask too, inside the boundary', async () => {
    const read = deferredRead()
    const { sdk, events } = make({ fetch: read.fetchImpl })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    read.answer(json({ enabled: false }))
    await sdk.whenSettled()
    sdk.on('closed', () => {
      throw new Error('host bug')
    })
    const target = document.body.appendChild(document.createElement('div'))
    const seen: string[] = []
    sdk.on('closed', () => seen.push('closed'))
    expect(() => sdk.mount('probe', target)).not.toThrow()
    expect(seen).toEqual([])
    await flush()
    expect(seen).toEqual(['closed'])
    expect(events.map((event) => event.reason)).toEqual(['disabled'])
  })
})

describe('rendered is reported once for a unit', () => {
  it('says nothing new when the frame reloads and draws again', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    const first = frameAt(0)
    await first.ready()
    first.say({ type: 'rendered' })
    first.say({ type: 'rendered' })
    await vi.waitFor(() => expect(events).toHaveLength(1))
    const second = frameAt(0)
    await second.ready()
    second.say({ type: 'size', height: 120 })
    second.say({ type: 'rendered' })
    second.say({ type: 'emit', name: 'seen' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toContain('probe:seen'))
    expect(events.map((event) => event.name)).toEqual(['rendered', 'probe:seen'])
  })
})

describe('the cap on units', () => {
  it('holds 50 live units, refuses the 51st with too_many_units, and has room after a close', async () => {
    const { sdk, target, events } = await boot()
    const units = Array.from({ length: 50 }, () => sdk.mount('probe', target))
    expect(iframes()).toHaveLength(50)
    const extra = sdk.mount('probe', target)
    await flush()
    expect(events).toEqual([
      { name: 'error', code: 'too_many_units', module: 'probe', unit: extra.id },
    ])
    expect(iframes()).toHaveLength(50)
    units[0]?.close()
    sdk.mount('probe', target)
    expect(iframes()).toHaveLength(50)
  })

  it('counts the waiting and the live together', async () => {
    const read = deferredRead()
    const { sdk, events } = make({ fetch: read.fetchImpl })
    sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    const target = document.body.appendChild(document.createElement('div'))
    for (let n = 0; n < 50; n += 1) sdk.mount('probe', target)
    read.answer(json({ enabled: true }))
    await sdk.whenSettled()
    expect(iframes()).toHaveLength(50)
    sdk.mount('probe', target)
    await flush()
    expect(events.map((event) => event.code)).toEqual(['too_many_units'])
  })
})

describe('a frame that never loads', () => {
  it('closes with timeout at the load cap, and not at the handshake budget', async () => {
    vi.useFakeTimers()
    const { sdk, target, events } = await boot({ loadTimeoutMs: 5000 })
    sdk.mount('probe', target)
    await vi.advanceTimersByTimeAsync(4999)
    expect(events).toEqual([])
    await vi.advanceTimersByTimeAsync(2)
    expect(events.map((event) => event.reason)).toEqual(['timeout'])
    expect(iframes()).toHaveLength(0)
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

  it('does not set the display of a declaration that names none', async () => {
    pollute('display', 'modal')
    const { sdk, target } = await boot({ modules: [{ name: 'plain-probe', title: 'Plain' }] })
    sdk.mount('plain-probe', target)
    const frame = frameAt(0)
    await frame.ready()
    expect(frame.received[0]).toMatchObject({ display: 'inline' })
  })

  it('does not set the placeholder height of a declaration that names none', async () => {
    pollute('placeholderHeight', 500)
    const { sdk, target } = await boot({ modules: [{ name: 'plain-probe', title: 'Plain' }] })
    sdk.mount('plain-probe', target)
    expect((iframes()[0] as HTMLIFrameElement).style.getPropertyValue('height')).toBe('100px')
  })
})

describe('a modal unit', () => {
  let page: DialogHandle
  const modalIframe = () => page.iframe()
  const modalFrame = (): FakeFrame => connectFrame(modalIframe())
  const closed = (events: SdkEvent[]) => events.filter((event) => event.name === 'closed')
  const html = () => document.documentElement

  afterEach(() => {
    page.restore()
    html().style.removeProperty('overflow')
  })
  const prepare = async (deps: Partial<SdkDeps> = {}) => {
    page = installDialog()
    return boot(deps)
  }

  it('is the module declared once: mount of a modal and open of an inline report bad_display', async () => {
    const { sdk, target, events } = await prepare()
    const mounted = sdk.mount('probe-modal', target)
    const opened = sdk.open('probe')
    expect(events).toEqual([])
    await flush()
    expect(events).toEqual([
      { name: 'error', code: 'bad_display', module: 'probe-modal', unit: mounted.id },
      { name: 'error', code: 'bad_display', module: 'probe', unit: opened.id },
    ])
    expect(() => {
      mounted.update({})
      mounted.close()
      opened.update({})
      opened.close()
    }).not.toThrow()
    expect(iframes()).toHaveLength(0)
    expect(page.container()).toBeNull()
  })

  it('opens a unit: the handle first, the closed dialog on the page, the frame in it', async () => {
    const { sdk, events } = await prepare()
    const unit = sdk.open('probe-modal', { a: 1 })
    expect(unit).toMatchObject({ id: 'u1', module: 'probe-modal' })
    const container = page.container() as HTMLElement
    expect(container.parentElement).toBe(document.body)
    expect(container.shadowRoot).toBeNull()
    const dialog = page.dialog() as HTMLDialogElement
    expect(dialog.getAttribute('aria-label')).toBe('Modal probe')
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(dialog.contains(modalIframe())).toBe(true)
    expect(modalIframe().getAttribute('title')).toBe('Modal probe')
    expect(new URL(modalIframe().getAttribute('src') as string).searchParams.get('m')).toBe(
      'probe-modal',
    )
    expect(events).toEqual([])
  })

  it('shows the dialog after the handshake and before the start message', async () => {
    const { sdk } = await prepare()
    sdk.open('probe-modal', { a: 1 })
    const frame = modalFrame()
    expect(page.order).toEqual([])
    const focus = vi.spyOn(modalIframe(), 'focus')
    await frame.ready()
    expect(page.order).toEqual(['showModal', 'start'])
    expect(focus).toHaveBeenCalledTimes(1)
    expect(frame.received[0]).toMatchObject({ type: 'start', display: 'modal', props: { a: 1 } })
    expect((page.dialog() as HTMLDialogElement).hasAttribute('open')).toBe(true)
  })

  it('shows no dialog and leaves the page alone when the frame never answers', async () => {
    vi.useFakeTimers()
    const { sdk, events } = await prepare()
    const write = vi.spyOn(html().style, 'setProperty')
    sdk.open('probe-modal')
    modalFrame()
    await vi.advanceTimersByTimeAsync(1100)
    expect(closed(events).map((event) => event.reason)).toEqual(['timeout'])
    expect(page.order).toEqual([])
    expect(write).not.toHaveBeenCalled()
    expect(html().style.getPropertyValue('overflow')).toBe('')
    expect(page.container()?.isConnected).toBe(false)
  })

  it('locks the page scroll while open and puts back what was there, with its priority', async () => {
    const { sdk } = await prepare()
    html().style.setProperty('overflow', 'scroll', 'important')
    const unit = sdk.open('probe-modal')
    await modalFrame().ready()
    expect(html().style.getPropertyValue('overflow')).toBe('hidden')
    unit.close()
    expect(html().style.getPropertyValue('overflow')).toBe('scroll')
    expect(html().style.getPropertyPriority('overflow')).toBe('important')
  })

  it('removes the property when the page had set none', async () => {
    const { sdk } = await prepare()
    const unit = sdk.open('probe-modal')
    await modalFrame().ready()
    unit.close()
    expect(html().style.getPropertyValue('overflow')).toBe('')
  })

  it('removes the dialog and the lock when the module fails, after it was shown', async () => {
    const { sdk, events } = await prepare()
    sdk.open('probe-modal')
    const frame = modalFrame()
    await frame.ready()
    frame.say({ type: 'error', code: 'module_failed' })
    await vi.waitFor(() => expect(closed(events)).toHaveLength(1))
    expect(closed(events)[0]?.reason).toBe('failed')
    expect(page.container()?.isConnected).toBe(false)
    expect(html().style.getPropertyValue('overflow')).toBe('')
  })

  it('closes with frame on the frame close message and with host on the handle', async () => {
    const { sdk, events } = await prepare()
    sdk.open('probe-modal')
    const frame = modalFrame()
    await frame.ready()
    frame.say({ type: 'close' })
    await vi.waitFor(() => expect(closed(events)).toHaveLength(1))
    expect(closed(events)[0]?.reason).toBe('frame')
    expect(page.container()?.isConnected).toBe(false)
    const again = sdk.open('probe-modal')
    again.close()
    expect(closed(events).map((event) => event.reason)).toEqual(['frame', 'host'])
  })

  it('closes with frame on the dialog cancel, and keeps the browser from closing it itself', async () => {
    const { sdk, events } = await prepare()
    sdk.open('probe-modal')
    await modalFrame().ready()
    const dialog = page.dialog() as HTMLDialogElement
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    expect(cancel.defaultPrevented).toBe(true)
    expect(closed(events).map((event) => event.reason)).toEqual(['frame'])
    expect(page.container()?.isConnected).toBe(false)
  })

  it('ignores a size message: there is no inline container to size', async () => {
    const { sdk, events } = await prepare()
    sdk.open('probe-modal')
    const frame = modalFrame()
    await frame.ready()
    const before = modalIframe().style.getPropertyValue('height')
    frame.say({ type: 'size', height: 300 })
    frame.say({ type: 'rendered' })
    await vi.waitFor(() => expect(events.map((event) => event.name)).toEqual(['rendered']))
    expect(modalIframe().style.getPropertyValue('height')).toBe(before)
  })

  it('refuses a second modal with modal_open, also one that still waits for the kill switch', async () => {
    page = installDialog()
    const read = deferredRead()
    const made = make({ fetch: read.fetchImpl })
    made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    const first = made.sdk.open('probe-modal')
    const second = made.sdk.open('probe-modal')
    expect(made.events).toEqual([])
    await flush()
    expect(made.events).toEqual([
      { name: 'error', code: 'modal_open', module: 'probe-modal', unit: second.id },
    ])
    expect(() => {
      second.update({})
      second.close()
    }).not.toThrow()
    first.close()
    expect(made.sdk.open('probe-modal').id).toBe('u3')
    await flush()
    expect(made.events.filter((event) => event.code === 'modal_open')).toHaveLength(1)
  })

  it('counts toward the cap of 50 units', async () => {
    page = installDialog()
    const read = deferredRead()
    const made = make({ fetch: read.fetchImpl })
    made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    const target = document.body.appendChild(document.createElement('div'))
    for (let n = 0; n < 49; n += 1) made.sdk.mount('probe', target)
    made.sdk.open('probe-modal')
    await flush()
    expect(made.events).toEqual([])
    const extra = made.sdk.mount('probe', target)
    await flush()
    expect(made.events).toEqual([
      { name: 'error', code: 'too_many_units', module: 'probe', unit: extra.id },
    ])
  })

  it('waits for the kill switch like a mount, and closes with disabled when it says so', async () => {
    page = installDialog()
    const read = deferredRead()
    const made = make({ fetch: read.fetchImpl })
    made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    const unit = made.sdk.open('probe-modal')
    expect(page.container()).toBeNull()
    read.answer(json({ enabled: false }))
    await made.sdk.whenSettled()
    const later = made.sdk.open('probe-modal')
    await flush()
    expect(page.container()).toBeNull()
    expect(made.events.map((event) => [event.name, event.unit, event.reason])).toEqual([
      ['closed', unit.id, 'disabled'],
      ['closed', later.id, 'disabled'],
    ])
  })

  it('starts once the kill switch says enabled', async () => {
    page = installDialog()
    const read = deferredRead()
    const made = make({ fetch: read.fetchImpl })
    made.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    made.sdk.open('probe-modal')
    expect(page.container()).toBeNull()
    read.answer(json({ enabled: true }))
    await made.sdk.whenSettled()
    expect(page.container()).not.toBeNull()
    await modalFrame().ready()
    expect(page.order).toEqual(['showModal', 'start'])
  })

  it('answers not_initialised before init, after the handle, and reports nothing without a window', async () => {
    page = installDialog()
    const { sdk, events } = make()
    const unit = sdk.open('probe-modal')
    expect(events).toEqual([])
    await flush()
    expect(events).toEqual([
      { name: 'error', code: 'not_initialised', module: 'probe-modal', unit: unit.id },
    ])
    expect(() => {
      unit.update({})
      unit.close()
    }).not.toThrow()
    const none = make({ getWindow: () => undefined })
    none.sdk.open('probe-modal')
    await flush()
    expect(none.events).toEqual([])
  })

  it('is closed with host by destroy, and the page is whole again', async () => {
    const { sdk, events } = await prepare()
    html().style.setProperty('overflow', 'auto')
    sdk.open('probe-modal')
    await modalFrame().ready()
    sdk.destroy()
    expect(closed(events).map((event) => event.reason)).toEqual(['host'])
    expect(page.container()?.isConnected).toBe(false)
    expect(html().style.getPropertyValue('overflow')).toBe('auto')
  })

  it('takes the new props of update', async () => {
    const { sdk } = await prepare()
    const unit = sdk.open('probe-modal', { n: 1 })
    const frame = modalFrame()
    await frame.ready()
    unit.update({ n: 2 })
    await vi.waitFor(() => expect(frame.received).toHaveLength(2))
    expect(frame.received[1]).toEqual({ v: 1, type: 'props', props: { n: 2 } })
  })

  it('reports bad_props for the props of open, as mount does', async () => {
    const { sdk, events } = await prepare()
    const unit = sdk.open('probe-modal', 'text' as never)
    await flush()
    expect(events).toEqual([
      { name: 'error', code: 'bad_props', module: 'probe-modal', unit: unit.id },
    ])
    expect(page.container()).toBeNull()
  })
})

describe('the focus of a modal unit', () => {
  let page: DialogHandle
  afterEach(() => {
    page.restore()
  })
  const opened = async (before: () => HTMLElement | null) => {
    page = installDialog()
    const { sdk } = await boot()
    const opener = before()
    const unit = sdk.open('probe-modal')
    const frame = connectFrame(page.iframe())
    await frame.ready()
    return { unit, opener }
  }
  const button = () => {
    const element = document.body.appendChild(document.createElement('button'))
    element.focus()
    return element
  }

  it('goes back to the element that had it when the unit was opened', async () => {
    const { unit, opener } = await opened(button)
    expect(document.activeElement).not.toBe(opener)
    unit.close()
    expect(document.activeElement).toBe(opener)
  })

  it('goes nowhere when the page had no focus: the body is never focused', async () => {
    const { unit } = await opened(() => null)
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    unit.close()
    expect(focus).not.toHaveBeenCalled()
  })

  it('goes nowhere when the element has left the page', async () => {
    const { unit, opener } = await opened(button)
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    opener?.remove()
    unit.close()
    expect(focus).not.toHaveBeenCalled()
  })
})

describe('a page that removes the frame of a unit', () => {
  let page: DialogHandle
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })
  const html = () => document.documentElement
  const closedReasons = (events: SdkEvent[]) =>
    events.filter((event) => event.name === 'closed').map((event) => event.reason)

  // The observers that are watching now: `observe` adds, `disconnect` removes.
  function watching() {
    const active = new Set<MutationObserver>()
    const observe = MutationObserver.prototype.observe
    const disconnect = MutationObserver.prototype.disconnect
    vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (
      this: MutationObserver,
      target: Node,
      options?: MutationObserverInit,
    ) {
      active.add(this)
      return observe.call(this, target, options)
    })
    vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementation(function (
      this: MutationObserver,
    ) {
      active.delete(this)
      return disconnect.call(this)
    })
    return active
  }
  const opened = async (deps: Partial<SdkDeps> = {}) => {
    page = installDialog()
    const made = await boot(deps)
    const unit = made.sdk.open('probe-modal')
    const frame = connectFrame(page.iframe())
    await frame.ready()
    return { ...made, unit, frame }
  }

  it('closes a modal with host when the body is swapped, and the page works again', async () => {
    const { sdk, events } = await opened()
    document.body.replaceChildren(document.createElement('main'))
    await vi.waitFor(() => expect(closedReasons(events)).toEqual(['host']))
    expect(html().style.getPropertyValue('overflow')).toBe('')
    const again = sdk.open('probe-modal')
    await flush()
    expect(again.id).toBe('u2')
    expect(events.filter((event) => event.name === 'error')).toEqual([])
    expect(page.dialog()?.isConnected).toBe(true)
  })

  it('closes a modal with host when the whole body element is replaced', async () => {
    const { events } = await opened()
    document.body.replaceWith(document.createElement('body'))
    await vi.waitFor(() => expect(closedReasons(events)).toEqual(['host']))
    expect(html().style.getPropertyValue('overflow')).toBe('')
  })

  it('has no observer before the dialog is shown, one while it is, and none after each end', async () => {
    const active = watching()
    page = installDialog()
    const { sdk, events } = await boot()
    expect(active.size).toBe(0)
    const ends: Array<(frame: FakeFrame, unit: { close(): void }) => void> = [
      (_frame, unit) => unit.close(),
      (frame) => frame.say({ type: 'close' }),
      (frame) => frame.say({ type: 'error', code: 'module_failed' }),
      () => void page.dialog()?.dispatchEvent(new Event('cancel', { cancelable: true })),
      () => sdk.destroy(),
      () => page.container()?.remove(),
    ]
    for (const end of ends) {
      sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
      await sdk.whenSettled()
      const unit = sdk.open('probe-modal')
      const frame = connectFrame(page.iframe())
      await frame.ready()
      expect(active.size).toBe(1)
      end(frame, unit)
      await vi.waitFor(() => expect(active.size).toBe(0))
      sdk.destroy()
    }
    expect(closedReasons(events)).toHaveLength(ends.length)
  })

  it('closes a stale modal record before it refuses a new open', async () => {
    const { sdk, events } = await opened()
    // Before the observer has run: the container is gone and the record still says live.
    page.container()?.remove()
    const again = sdk.open('probe-modal')
    await flush()
    expect(again.id).toBe('u2')
    expect(events.filter((event) => event.name === 'error')).toEqual([])
    expect(closedReasons(events)).toEqual(['host'])
  })

  it('does not let containers the page removed fill the cap of 50', async () => {
    const { sdk, target, events } = await boot()
    for (let n = 0; n < 50; n += 1) sdk.mount('probe', target)
    expect(iframes()).toHaveLength(50)
    target.remove()
    const fresh = document.body.appendChild(document.createElement('div'))
    const next = sdk.mount('probe', fresh)
    await flush()
    expect(events.filter((event) => event.name === 'error')).toEqual([])
    expect(closedReasons(events)).toEqual(Array.from({ length: 50 }, () => 'host'))
    expect(next.id).toBe('u51')
    expect(fresh.querySelectorAll('iframe')).toHaveLength(1)
  })

  it('leaves a unit whose target is not in the page yet, and closes it once it was and left', async () => {
    const { sdk, target, events } = await boot()
    const detached = document.createElement('div')
    sdk.mount('probe', detached)
    sdk.mount('probe', target)
    await flush()
    expect(closedReasons(events)).toEqual([])
    document.body.appendChild(detached)
    sdk.mount('probe', target)
    detached.remove()
    sdk.mount('probe', target)
    await flush()
    expect(closedReasons(events)).toEqual(['host'])
  })

  it('leaves a unit whose frame is in the page alone', async () => {
    const { sdk, target, events } = await boot()
    sdk.mount('probe', target)
    sdk.mount('probe', target)
    await flush()
    expect(closedReasons(events)).toEqual([])
    expect(iframes()).toHaveLength(2)
  })
})

describe('the scroll lock of two instances', () => {
  let page: DialogHandle
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })

  it('ends with the own value of the page when two instances close in the order they opened', async () => {
    page = installDialog()
    const first = await boot()
    const second = make()
    second.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    await second.sdk.whenSettled()
    const a = first.sdk.open('probe-modal')
    await connectFrame(page.iframe()).ready()
    const b = second.sdk.open('probe-modal')
    await connectFrame(page.iframe()).ready()
    a.close()
    b.close()
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('')
  })

  it('keeps a value the page set while the modal was open', async () => {
    page = installDialog()
    const { sdk } = await boot()
    const unit = sdk.open('probe-modal')
    await connectFrame(page.iframe()).ready()
    document.documentElement.style.setProperty('overflow', 'auto')
    unit.close()
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('auto')
  })
})

describe('a unit told denied', () => {
  let page: DialogHandle | undefined
  afterEach(() => {
    page?.restore()
    page = undefined
    document.documentElement.style.removeProperty('overflow')
  })
  const closed = (events: SdkEvent[]) => events.filter((event) => event.name === 'closed')
  const consents = (frame: FakeFrame) =>
    frame.received.filter((message) => message['type'] === 'consent')
  const inline = async (deps: Partial<SdkDeps> = {}) => {
    const made = await boot(deps)
    const unit = made.sdk.mount('probe', made.target)
    const frame = frameAt(0)
    await frame.ready()
    return { ...made, unit, frame }
  }
  const modalOpen = async (deps: Partial<SdkDeps> = {}) => {
    page = installDialog()
    const made = await boot(deps)
    const opener = document.body.appendChild(document.createElement('button'))
    opener.focus()
    const unit = made.sdk.open('probe-modal')
    const frame = connectFrame(page.iframe())
    await frame.ready()
    return { ...made, unit, frame, opener }
  }

  it('is not removed from the page before it acknowledges: closed is reported at once', async () => {
    const { sdk, unit, frame, events } = await inline()
    sdk.setConsent('denied')
    unit.close()
    expect(closed(events)).toHaveLength(1)
    expect(iframes()).toHaveLength(1)
    await vi.waitFor(() => expect(consents(frame)).toHaveLength(1))
    frame.say({ type: 'ack', state: 'denied' })
    await vi.waitFor(() => expect(iframes()).toHaveLength(0))
    expect(closed(events)).toHaveLength(1)
  })

  it('is removed after the cap when no ack comes', async () => {
    vi.useFakeTimers()
    const { sdk, unit } = await inline({ denialAckMs: 50 })
    sdk.setConsent('denied')
    unit.close()
    await vi.advanceTimersByTimeAsync(49)
    expect(iframes()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(iframes()).toHaveLength(0)
  })

  it('has a cap of 300 ms by default', async () => {
    vi.useFakeTimers()
    const { sdk, unit } = await inline()
    sdk.setConsent('denied')
    unit.close()
    await vi.advanceTimersByTimeAsync(299)
    expect(iframes()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(iframes()).toHaveLength(0)
  })

  it('removes a unit at once when nothing is waiting: granted, or a denial already acknowledged', async () => {
    const granted = await inline()
    granted.sdk.setConsent('granted')
    granted.unit.close()
    expect(iframes()).toHaveLength(0)
    document.body.replaceChildren()
    const acked = await inline()
    acked.sdk.setConsent('denied')
    await vi.waitFor(() => expect(consents(acked.frame)).toHaveLength(1))
    acked.frame.say({ type: 'ack', state: 'denied' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    acked.unit.close()
    expect(iframes()).toHaveLength(0)
  })

  it('does not wait for a denial a later grant replaced, nor for a unit not yet started', async () => {
    const { sdk, unit } = await inline()
    sdk.setConsent('denied')
    sdk.setConsent('granted')
    unit.close()
    expect(iframes()).toHaveLength(0)
    const read = deferredRead()
    const waiting = make({ fetch: read.fetchImpl })
    waiting.sdk.init({ key: 'pk_a', apiOrigin: ORIGIN })
    const target = document.body.appendChild(document.createElement('div'))
    const queued = waiting.sdk.mount('probe', target)
    waiting.sdk.setConsent('denied')
    queued.close()
    expect(iframes()).toHaveLength(0)
  })

  it('does the whole close of a modal at once, and removes the frame on the ack', async () => {
    const { sdk, unit, frame, events, opener } = await modalOpen()
    sdk.setConsent('denied')
    unit.close()
    expect(closed(events)).toHaveLength(1)
    const dialog = (page as DialogHandle).dialog() as HTMLDialogElement
    expect(dialog.hasAttribute('open')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('')
    expect(document.activeElement).toBe(opener)
    expect((page as DialogHandle).container()?.isConnected).toBe(true)
    await vi.waitFor(() => expect(consents(frame)).toHaveLength(1))
    frame.say({ type: 'ack', state: 'denied' })
    await vi.waitFor(() => expect((page as DialogHandle).container()?.isConnected).toBe(false))
  })

  it('removes the frame of a modal at the cap when no ack comes, and a next open already works', async () => {
    vi.useFakeTimers()
    const { sdk, unit, events } = await modalOpen({ denialAckMs: 100 })
    sdk.setConsent('denied')
    unit.close()
    const next = sdk.open('probe-modal')
    await vi.advanceTimersByTimeAsync(0)
    expect(events.filter((event) => event.name === 'error')).toEqual([])
    expect(next.id).toBe('u2')
    await vi.advanceTimersByTimeAsync(101)
    const [old, current] = (page as DialogHandle).roots
    expect([old?.host.isConnected, current?.host.isConnected]).toEqual([false, true])
  })

  it('removes a modal at once when no denial is pending', async () => {
    const { unit } = await modalOpen()
    unit.close()
    expect((page as DialogHandle).container()?.isConnected).toBe(false)
  })

  it('is not shown or started again by a frame that reloads while it waits', async () => {
    const { sdk, unit } = await modalOpen()
    sdk.setConsent('denied')
    unit.close()
    const shown = (page as DialogHandle).order.length
    const reloaded = connectFrame((page as DialogHandle).iframe())
    reloaded.say({ type: 'ready' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect((page as DialogHandle).order).toHaveLength(shown)
    expect(reloaded.received).toEqual([])
  })
})

describe('the render budget of a modal', () => {
  let page: DialogHandle
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })
  const closedReasons = (events: SdkEvent[]) =>
    events.filter((event) => event.name === 'closed').map((event) => event.reason)

  it('closes with timeout when rendered does not come within 10 s of start', async () => {
    vi.useFakeTimers()
    page = installDialog()
    const { sdk, events } = await boot()
    sdk.open('probe-modal')
    const frame = connectFrame(page.iframe())
    await frame.ready()
    await vi.advanceTimersByTimeAsync(9_900)
    expect(closedReasons(events)).toEqual([])
    await vi.advanceTimersByTimeAsync(200)
    expect(closedReasons(events)).toEqual(['timeout'])
    expect(page.container()?.isConnected).toBe(false)
    expect(document.documentElement.style.getPropertyValue('overflow')).toBe('')
  })

  it('takes the budget from the dependency a test gives', async () => {
    vi.useFakeTimers()
    page = installDialog()
    const { sdk, events } = await boot({ renderTimeoutMs: 500 })
    sdk.open('probe-modal')
    await connectFrame(page.iframe()).ready()
    await vi.advanceTimersByTimeAsync(501)
    expect(closedReasons(events)).toEqual(['timeout'])
  })

  it('is cleared by a rendered in time', async () => {
    vi.useFakeTimers()
    page = installDialog()
    const { sdk, events } = await boot()
    sdk.open('probe-modal')
    const frame = connectFrame(page.iframe())
    await frame.ready()
    await vi.advanceTimersByTimeAsync(5_000)
    frame.say({ type: 'rendered' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(closedReasons(events)).toEqual([])
    expect(page.container()?.isConnected).toBe(true)
  })

  it('is cleared when the unit closes first, and an inline unit has none', async () => {
    vi.useFakeTimers()
    page = installDialog()
    const { sdk, target, events } = await boot()
    const unit = sdk.open('probe-modal')
    await connectFrame(page.iframe()).ready()
    unit.close()
    sdk.mount('probe', target)
    await frameAt(iframes().length - 1).ready()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(closedReasons(events)).toEqual(['host'])
    expect(iframes()).toHaveLength(1)
  })
})

describe('a dialog the browser cannot show', () => {
  let page: DialogHandle
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })

  it('reports internal and closes failed, with no scroll write and no container left', async () => {
    page = installDialog()
    ;(HTMLDialogElement.prototype as unknown as Record<string, unknown>)['showModal'] = () => {
      throw new DOMException('not connected', 'InvalidStateError')
    }
    const { sdk, events } = await boot()
    const write = vi.spyOn(document.documentElement.style, 'setProperty')
    sdk.open('probe-modal')
    connectFrame(page.iframe()).say({ type: 'ready' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(events.map((event) => [event.name, event.code ?? event.reason])).toEqual([
      ['error', 'internal'],
      ['closed', 'failed'],
    ])
    expect(write).not.toHaveBeenCalled()
    expect(page.container()?.isConnected).toBe(false)
    expect(iframes()).toHaveLength(0)
  })
})

describe('where a modal goes and who gets the focus back', () => {
  let page: DialogHandle
  afterEach(() => {
    page.restore()
    document.documentElement.style.removeProperty('overflow')
  })

  it('puts the dialog on the root element when the page has no body yet', async () => {
    page = installDialog()
    const { sdk, events } = await boot()
    const body = document.body
    body.remove()
    try {
      sdk.open('probe-modal')
      await flush()
      expect(page.container()?.parentElement).toBe(document.documentElement)
      expect(events.filter((event) => event.name === 'error')).toEqual([])
    } finally {
      document.documentElement.appendChild(body)
    }
  })

  it('gives the focus back to the element inside an open shadow root that had it', async () => {
    page = installDialog()
    const { sdk } = await boot()
    const host = document.body.appendChild(document.createElement('div'))
    const inner = host.attachShadow({ mode: 'open' }).appendChild(document.createElement('button'))
    inner.focus()
    expect(document.activeElement).toBe(host)
    const unit = sdk.open('probe-modal')
    await connectFrame(page.iframe()).ready()
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    unit.close()
    expect(focus.mock.contexts).toContain(inner)
  })
})
