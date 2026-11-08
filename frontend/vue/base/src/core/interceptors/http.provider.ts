import { client } from '@/services/generated/client.gen'

import { errorInterceptor } from './error.interceptor'

// Registers the error interceptor on the generated client: the one place a runtime import of the
// client sits outside services/. app/plugins.ts calls it once; a second call changes nothing.
export function installInterceptors(): void {
  if (client.interceptors.error.exists(errorInterceptor)) return
  client.interceptors.error.use(errorInterceptor)
}
