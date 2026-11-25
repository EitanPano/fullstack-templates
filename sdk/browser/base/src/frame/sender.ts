import {
  TELEMETRY_PATH,
  createTelemetryBuffer,
  requestInit,
  type TelemetryBuffer,
} from '../protocol'

const TIMEOUT_MS = 3000
const NAMESPACE = '/api/sdk/'

export type SenderOptions = {
  key: string
  win: Window
  allowed: () => boolean
  fetch?: typeof fetch
}

export type Sender = TelemetryBuffer & {
  request(path: string, body?: unknown): Promise<unknown>
}

/**
 * The one caller of `fetch` inside the frame, with the same rules as transport/: its own origin,
 * the key header, no cookie, the default cache mode, a timeout, JSON with `keepalive`, and
 * nothing before the host has granted consent. The frame is where the token lives and where the
 * server's counting events come from, so they never cross the channel.
 */
export function createSender(options: SenderOptions): Sender {
  const inFlight = new Set<AbortController>()
  const buffer = createTelemetryBuffer({
    allowed: options.allowed,
    win: options.win,
    send: (events) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      const init = requestInit({
        key: options.key,
        signal: controller.signal,
        body: { events },
        keepalive: true,
      })
      const call = options.fetch ?? fetch
      call(options.win.location.origin + TELEMETRY_PATH, init)
        .catch(() => undefined)
        .finally(() => clearTimeout(timer))
    },
  })

  // A call a module makes on purpose (an entity the server mounts behind `frameOnly`): its own
  // origin and the SDK namespace only, one try, and a fixed code as the only error text.
  async function request(path: string, body?: unknown): Promise<unknown> {
    const origin = options.win.location.origin
    let url: URL
    try {
      url = new URL(origin + path)
    } catch {
      throw new Error('bad_path')
    }
    if (url.origin !== origin || !url.pathname.startsWith(NAMESPACE)) throw new Error('bad_path')

    const controller = new AbortController()
    inFlight.add(controller)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, TIMEOUT_MS)
    try {
      const init = requestInit({
        key: options.key,
        signal: controller.signal,
        ...(body === undefined ? {} : { body }),
      })
      const response = await (options.fetch ?? fetch)(url.href, init)
      if (!response.ok) throw new Error(`status_${response.status}`)
      if (response.status === 204) return undefined
      // The timeout covers the body too: a stalled stream ends with the signal.
      const stopped = new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        ),
      )
      stopped.catch(() => undefined)
      const text = await Promise.race([response.text(), stopped])
      return text === '' ? undefined : (JSON.parse(text) as unknown)
    } catch (error) {
      if (timedOut) throw new Error('timeout')
      if (error instanceof Error && /^status_\d+$/.test(error.message)) throw error
      throw new Error('network')
    } finally {
      clearTimeout(timer)
      inFlight.delete(controller)
    }
  }

  return {
    ...buffer,
    request,
    dispose() {
      for (const controller of inFlight) controller.abort()
      inFlight.clear()
      buffer.dispose()
    },
  }
}
