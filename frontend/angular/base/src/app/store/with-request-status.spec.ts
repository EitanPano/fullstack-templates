import { TestBed } from '@angular/core/testing'
import { patchState, signalStore, withState } from '@ngrx/signals'

import { ApiError } from '@app/models/api/response'

import { setError, setLoaded, setLoading, withRequestStatus } from './with-request-status'

// protectedState: false lets the spec patch from outside; a real store patches inside its methods.
const TestStore = signalStore(
  { providedIn: 'root', protectedState: false },
  withState({ rows: [] as string[] }),
  withRequestStatus(),
)

describe('withRequestStatus', () => {
  it('starts idle with no error', () => {
    const store = TestBed.inject(TestStore)
    expect(store.status()).toBe('idle')
    expect(store.error()).toBeNull()
    expect([store.loading(), store.loaded(), store.failed()]).toEqual([false, false, false])
  })

  it('moves through loading, loaded and error, setting the flags', () => {
    const store = TestBed.inject(TestStore)
    patchState(store, setLoading())
    expect(store.loading()).toBe(true)
    patchState(store, { rows: ['a'] }, setLoaded())
    expect(store.loaded()).toBe(true)
    expect(store.rows()).toEqual(['a'])
    const error = new ApiError({ status: 500, code: 'internal' })
    patchState(store, setError(error))
    expect(store.failed()).toBe(true)
    expect(store.error()).toBe(error)
  })

  it('clears the error when a new load starts', () => {
    const store = TestBed.inject(TestStore)
    patchState(store, setError(new ApiError({ status: 0, code: 'network' })))
    patchState(store, setLoading())
    expect(store.error()).toBeNull()
    expect(store.failed()).toBe(false)
  })
})
