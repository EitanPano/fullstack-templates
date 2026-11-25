import { vi } from 'vitest'

// jsdom has neither IntersectionObserver nor ResizeObserver: these stand in, with a handle to fire.
export type IntersectionHandle = {
  fire(entry: { intersectionRatio: number; isVisible?: boolean }): void
  options: IntersectionObserverInit & { trackVisibility?: boolean; delay?: number }
  disconnected: boolean
}

export function installIntersection(v2: boolean): { current: () => IntersectionHandle } {
  let handle: IntersectionHandle | undefined
  class Observer {
    constructor(
      private callback: (entries: unknown[]) => void,
      options: IntersectionHandle['options'],
    ) {
      handle = {
        options,
        disconnected: false,
        fire: (entry) => this.callback([{ isIntersecting: entry.intersectionRatio > 0, ...entry }]),
      }
    }
    observe() {}
    unobserve() {}
    disconnect() {
      if (handle) handle.disconnected = true
    }
  }
  class Entry {}
  if (v2) Object.defineProperty(Entry.prototype, 'isVisible', { get: () => false })
  vi.stubGlobal('IntersectionObserver', Observer)
  vi.stubGlobal('IntersectionObserverEntry', Entry)
  return {
    current: () => {
      if (!handle) throw new Error('no IntersectionObserver was created')
      return handle
    },
  }
}

export function installResize(): { fire(height: number): void } {
  let callback: (entries: unknown[]) => void = () => undefined
  class Observer {
    constructor(cb: (entries: unknown[]) => void) {
      callback = cb
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer)
  return { fire: (height) => callback([{ contentRect: { height } }]) }
}

export function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

export function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
  window.dispatchEvent(new Event('resize'))
}
