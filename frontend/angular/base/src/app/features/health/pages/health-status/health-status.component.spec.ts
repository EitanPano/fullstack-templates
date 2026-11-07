import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { provideTestTranslator } from '@app/core/i18n/translator.testing'
import { ApiError } from '@app/models/api/response'
import type { HealthResponse } from '@app/models/health/interface'
import { NOW } from '@app/shared/pipes/relative-time.pipe'
import { HealthStore } from '@app/store/health.store'

import { HealthStatusComponent } from './health-status.component'

const CHECKED_AT = '2026-11-06T10:00:00.000Z'

function fakeStore() {
  const status = signal<'idle' | 'loading' | 'loaded' | 'error'>('loading')
  const health = signal<HealthResponse | null>(null)
  const error = signal<ApiError | null>(null)
  return {
    status,
    health,
    error,
    checkedAt: signal<string | null>(CHECKED_AT),
    loading: () => status() === 'loading',
    loaded: () => status() === 'loaded',
    failed: () => status() === 'error',
    load: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  }
}

describe('HealthStatusComponent', () => {
  let store: ReturnType<typeof fakeStore>

  beforeEach(() => {
    store = fakeStore()
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslator(),
        { provide: HealthStore, useValue: store },
        { provide: NOW, useValue: () => new Date('2026-11-06T10:03:00.000Z') },
      ],
    })
  })

  async function render() {
    const fixture = TestBed.createComponent(HealthStatusComponent)
    await fixture.whenStable()
    return { fixture, element: fixture.nativeElement as HTMLElement }
  }

  it('loads on open and shows a skeleton with a busy status while loading', async () => {
    const { element } = await render()
    expect(store.load).toHaveBeenCalledTimes(1)
    expect(element.querySelectorAll('h1')).toHaveLength(1)
    expect(element.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull()
    expect(element.querySelector('.health-status__facts')).toBeNull()
  })

  it('shows the status badge, version, uptime and when it was last checked', async () => {
    store.status.set('loaded')
    store.health.set({ status: 'ok', uptimeSeconds: 90, version: '2.1.0' })
    const { element } = await render()
    expect(element.querySelector('app-health-badge')?.textContent).toContain('Operational')
    const text = element.querySelector('.health-status__facts')?.textContent ?? ''
    expect(text).toContain('2.1.0')
    expect(text).toContain('90 seconds')
    expect(text).toContain('3 minutes ago')
    expect(element.querySelector('[role="alert"]')).toBeNull()
  })

  it('shows the error state with the mapped copy and retries through the store', async () => {
    store.status.set('error')
    store.error.set(new ApiError({ status: 0, code: 'network' }))
    const { element } = await render()
    const alert = element.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('Cannot reach the server')
    expect(element.querySelector('.health-status__facts')).toBeNull()
    store.load.mockClear()
    const retry = Array.from(alert?.querySelectorAll('button') ?? []).find((b) =>
      b.textContent.includes('Try again'),
    )
    retry?.click()
    expect(store.load).toHaveBeenCalledTimes(1)
  })

  it('refreshes from the header button', async () => {
    store.status.set('loaded')
    store.health.set({ status: 'ok', uptimeSeconds: 1, version: '1' })
    const { element } = await render()
    store.load.mockClear()
    const button = Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Refresh'),
    )
    button?.click()
    expect(store.load).toHaveBeenCalledTimes(1)
  })
})
