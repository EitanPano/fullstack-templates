import { TELEMETRY_PATH, createTelemetryBuffer, requestInit } from '../protocol'

const TIMEOUT_MS = 3000

export type SenderOptions = {
  key: string
  win: Window
  allowed: () => boolean
  fetch?: typeof fetch
}

/**
 * The one caller of `fetch` inside the frame, with the same rules as transport/: its own origin,
 * the key header, no cookie, the default cache mode, a timeout, JSON with `keepalive`, and
 * nothing before the host has granted consent. The frame is where the token lives and where the
 * server's counting events come from, so they never cross the channel.
 */
export function createSender(options: SenderOptions) {
  return createTelemetryBuffer({
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
}
