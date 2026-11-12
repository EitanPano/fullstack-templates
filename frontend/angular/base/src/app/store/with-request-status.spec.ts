import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals'

import { LoggerService } from '@app/core/providers/logger.service'
import { NetworkService } from '@app/core/providers/network.service'
import { NotificationService } from '@app/core/providers/notification.service'
import { ApiError } from '@app/services/api-error'

import { withRequestStatus } from './with-request-status'

// A promise the test settles by hand, to hold a call in flight.
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const TestStore = signalStore(
  { providedIn: 'root' },
  withState({ rows: [] as string[] }),
  withRequestStatus({ store: 'TestStore', calls: ['load', 'save'] }),
  withMethods((store) => ({
    load: (request: () => Promise<string[]>) =>
      store._call('load', request, {
        onSuccess: (rows) => {
          patchState(store, { rows })
        },
      }),
    save: (request: () => Promise<void>, form = false) =>
      store._call('save', request, {
        mutation: true,
        form,
        overrides: { conflict: 'test.taken' },
      }),
    probe: (request: () => Promise<void>) => store._call('load', request, { silent: true }),
    reset: () => {
      store._resetCalls()
    },
  })),
)

describe('withRequestStatus', () => {
  const showError = vi.fn<(key: string) => number>(() => 1)
  const logError = vi.fn<(message: string, ...details: unknown[]) => void>()
  const online = signal(true)

  beforeEach(() => {
    online.set(true)
    showError.mockClear()
    logError.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationService, useValue: { showError } },
        { provide: LoggerService, useValue: { error: logError } },
        { provide: NetworkService, useValue: { online } },
      ],
    })
  })

  it('starts every call idle with no error', () => {
    const store = TestBed.inject(TestStore)
    for (const name of ['load', 'save'] as const) {
      expect([store.loading(name), store.loaded(name), store.failed(name)]).toEqual([
        false,
        false,
        false,
      ])
      expect(store.error(name)).toBeNull()
    }
  })

  it('keeps one status per call: a save in flight leaves the load untouched', async () => {
    const store = TestBed.inject(TestStore)
    const pending = deferred<undefined>()
    const saving = store.save(() => pending.promise)
    expect(store.loading('save')).toBe(true)
    expect(store.loading('load')).toBe(false)
    pending.resolve(undefined)
    expect(await saving).toEqual({ ok: true, value: undefined })
    expect(store.loaded('save')).toBe(true)
  })

  it('applies the answer and resolves ok', async () => {
    const store = TestBed.inject(TestStore)
    expect(await store.load(() => Promise.resolve(['a']))).toEqual({ ok: true, value: ['a'] })
    expect(store.rows()).toEqual(['a'])
    expect(store.loaded('load')).toBe(true)
  })

  it('records a failure on its call, toasts its copy once and resolves with the error', async () => {
    const store = TestBed.inject(TestStore)
    const error = new ApiError({ status: 500, code: 'internal' })
    expect(await store.load(() => Promise.reject(error))).toEqual({ ok: false, error })
    expect(store.failed('load')).toBe(true)
    expect(store.error('load')).toBe(error)
    expect(showError).toHaveBeenCalledTimes(1)
    expect(showError).toHaveBeenCalledWith('errors.internal')
  })

  it('uses an override for its code', async () => {
    const store = TestBed.inject(TestStore)
    await store.save(() => Promise.reject(new ApiError({ status: 409, code: 'conflict' })))
    expect(showError).toHaveBeenCalledWith('test.taken')
  })

  it('logs a cause that is not an ApiError and shows errors.unknown', async () => {
    const store = TestBed.inject(TestStore)
    const result = await store.load(() => Promise.reject(new TypeError('boom')))
    expect(result.ok).toBe(false)
    expect(store.error('load')?.code).toBe('unknown')
    expect(logError).toHaveBeenCalledWith('TestStore.load failed', expect.any(TypeError))
    expect(showError).toHaveBeenCalledWith('errors.unknown')
  })

  it('leaves validation_failed to the page behind a form, and toasts it elsewhere', async () => {
    const store = TestBed.inject(TestStore)
    const invalid = new ApiError({ status: 400, code: 'validation_failed' })
    await store.save(() => Promise.reject(invalid), true)
    expect(showError).not.toHaveBeenCalled()
    await store.save(() => Promise.reject(invalid), false)
    expect(showError).toHaveBeenCalledWith('errors.validation_failed')
  })

  it('does not toast a silent call', async () => {
    const store = TestBed.inject(TestStore)
    await store.probe(() => Promise.reject(new ApiError({ status: 0, code: 'network' })))
    expect(store.failed('load')).toBe(true)
    expect(showError).not.toHaveBeenCalled()
  })

  it('does not send a mutation while offline', async () => {
    online.set(false)
    const store = TestBed.inject(TestStore)
    const request = vi.fn(() => Promise.resolve())
    expect(await store.save(request)).toEqual({ ok: false, error: null })
    expect(request).not.toHaveBeenCalled()
    expect(store.loading('save')).toBe(false)
    expect(showError).toHaveBeenCalledWith('errors.offline')
  })

  it('lets the latest call of a name win: an older answer is dropped unseen', async () => {
    const store = TestBed.inject(TestStore)
    const first = deferred<string[]>()
    const second = deferred<string[]>()
    const older = store.load(() => first.promise)
    const newer = store.load(() => second.promise)
    second.resolve(['new'])
    expect(await newer).toEqual({ ok: true, value: ['new'] })
    first.reject(new ApiError({ status: 500, code: 'internal' }))
    expect(await older).toEqual({ ok: false, error: null })
    expect(store.rows()).toEqual(['new'])
    expect(store.loaded('load')).toBe(true)
    expect(showError).not.toHaveBeenCalled()
  })

  it('drops an answer in flight on reset and returns every call to idle', async () => {
    const store = TestBed.inject(TestStore)
    const pending = deferred<string[]>()
    const loading = store.load(() => pending.promise)
    store.reset()
    expect(store.loading('load')).toBe(false)
    pending.resolve(['stale'])
    expect(await loading).toEqual({ ok: false, error: null })
    expect(store.rows()).toEqual([])
  })

  it('clears the error when the call runs again', async () => {
    const store = TestBed.inject(TestStore)
    await store.load(() => Promise.reject(new ApiError({ status: 0, code: 'network' })))
    const pending = deferred<string[]>()
    void store.load(() => pending.promise)
    expect(store.error('load')).toBeNull()
    expect(store.failed('load')).toBe(false)
  })
})
