import type { Resource } from '../../infra/dependency'
import type { HealthResponse, Readiness } from './schema'
import * as service from './service'

// A controller is the module's public API: one typed function per operation, no `req`,
// no `res`, no status code. It calls its own service and, across a module boundary,
// another module's controller. The route adapter maps HTTP onto it.
export function getHealth(): HealthResponse {
  return service.getHealth()
}

// `list` is the seam the tests use; the default mount passes nothing and gets every
// dependency (infra/dependency.ts).
export function getReadiness(list?: readonly Resource[]): Promise<Readiness> {
  return service.getReadiness(list)
}
