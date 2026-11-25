import { TELEMETRY_PATH, createTelemetryBuffer, requestInit } from '../protocol'

// The one door to the network on the host side (the frame has its own, frame/sender.ts). Every
// request has a timeout, no cookie and the key header; a read is retried on a network failure
// or a 5xx, never on a timeout (the kill switch must not wait twice) or a 4xx.
export type TransportOptions = {
  apiOrigin: string
  key: string
  allowTelemetry: () => boolean
  win: Window
  fetch?: typeof fetch
  timeoutMs?: number
  retries?: number
  retryDelayMs?: number
}

export type Transport = {
  getJson(path: string): Promise<unknown>
  track(item: unknown): void
  flush(): void
  dispose(): void
}

const DEFAULT_TIMEOUT_MS = 3000
const DEFAULT_RETRIES = 1
const DEFAULT_RETRY_DELAY_MS = 300

class Retryable extends Error {}

export function createTransport(options: TransportOptions): Transport {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const call = (url: string, init: RequestInit) => (options.fetch ?? fetch)(url, init)

  // Every request in flight, so `dispose` can stop it: a destroyed SDK has nothing to wait for.
  const inFlight = new Set<AbortController>()

  // The timeout covers the whole read: the wait for headers and, for a JSON read, the body.
  async function once<T>(
    path: string,
    read: (response: Response) => Promise<T>,
    body?: unknown,
    keepalive?: boolean,
  ): Promise<T> {
    const controller = new AbortController()
    inFlight.add(controller)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    try {
      const init = requestInit({
        key: options.key,
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
        ...(keepalive ? { keepalive } : {}),
      })
      const response = await call(options.apiOrigin + path, init)
      if (response.status >= 500) throw new Retryable(`status ${response.status}`)
      if (!response.ok) throw new Error(`status ${response.status}`)
      // A body read ends with the signal too, whatever the engine does with a stalled stream.
      const stopped = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        ),
      )
      stopped.catch(() => undefined)
      return await Promise.race([read(response), stopped])
    } catch (error) {
      if (timedOut) throw new Error('timeout')
      if (error instanceof TypeError) throw new Retryable(error.message)
      throw error
    } finally {
      clearTimeout(timer)
      inFlight.delete(controller)
    }
  }

  async function getJson(path: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once(path, (response) => response.json() as Promise<unknown>)
      } catch (error) {
        if (!(error instanceof Retryable) || attempt >= retries) throw error
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }
  }

  const buffer = createTelemetryBuffer({
    allowed: options.allowTelemetry,
    win: options.win,
    // A page being left cannot wait for an answer or retry: one try, keepalive, errors dropped.
    send: (events) => {
      once(TELEMETRY_PATH, async () => undefined, { events }, true).catch(() => undefined)
    },
  })

  function dispose() {
    for (const controller of inFlight) controller.abort()
    inFlight.clear()
    buffer.dispose()
  }

  return { getJson, track: buffer.push, flush: buffer.flush, dispose }
}
