import { TestBed } from '@angular/core/testing'

import { NetworkService } from './network.service'

describe('NetworkService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts from navigator.onLine and follows the offline and online events', () => {
    const network = TestBed.inject(NetworkService)
    expect(network.online()).toBe(true)
    window.dispatchEvent(new Event('offline'))
    expect(network.online()).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(network.online()).toBe(true)
  })

  it('stops listening when the injector is destroyed', () => {
    const network = TestBed.inject(NetworkService)
    TestBed.resetTestingModule()
    window.dispatchEvent(new Event('offline'))
    expect(network.online()).toBe(true)
  })

  it('reads an offline start', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    expect(TestBed.inject(NetworkService).online()).toBe(false)
  })
})
