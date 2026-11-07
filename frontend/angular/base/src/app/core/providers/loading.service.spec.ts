import { TestBed } from '@angular/core/testing'

import { LoadingService } from './loading.service'

describe('LoadingService', () => {
  it('is busy while any request is pending', () => {
    const loading = TestBed.inject(LoadingService)
    expect(loading.busy()).toBe(false)
    loading.start()
    loading.start()
    loading.stop()
    expect(loading.busy()).toBe(true)
    loading.stop()
    expect(loading.busy()).toBe(false)
  })

  it('never counts below zero', () => {
    const loading = TestBed.inject(LoadingService)
    loading.stop()
    loading.start()
    expect(loading.busy()).toBe(true)
  })
})
