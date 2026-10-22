import type { Server } from 'node:http'

import { defaultedSecrets, env } from './config/env'
import { connectAll, createShutdown, disconnectAll } from './infra/dependency'
import { app } from './server'
import { log } from './services/logger'

// The process entry: connect every dependency (infra/dependency.ts), listen, and leave
// cleanly on a signal.
// Nothing imports this file; tests import `app` from server.ts and never start infra.
// The signal handlers are bound before anything connects: Bun is PID 1 in the container,
// and a stop during boot must be honoured, not left to the kill after the grace period.
const http: { server?: Server } = {}

const shutdown = createShutdown({
  close: () =>
    new Promise((resolve, reject) => {
      const server = http.server
      if (server === undefined) {
        resolve()
        return
      }
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
      server.closeIdleConnections()
    }),
})
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

for (const name of defaultedSecrets) {
  log.warn('using a development default for a secret', { variable: name })
}

try {
  await connectAll()
} catch (error) {
  log.error('infra failed to start', { step: 'connectAll' }, error)
  process.exit(1)
}

const server = app.listen(env.PORT)
http.server = server
server.once('listening', () => {
  log.info('listening', { url: `http://localhost:${String(env.PORT)}`, env: env.NODE_ENV })
})
// A bind failure (port in use, no permission) is fatal: close what connected and leave
// with a non-zero code instead of lingering as a process that serves nothing.
server.on('error', (error) => {
  log.error('listen failed', { port: env.PORT }, error)
  void disconnectAll().finally(() => {
    process.exit(1)
  })
})
