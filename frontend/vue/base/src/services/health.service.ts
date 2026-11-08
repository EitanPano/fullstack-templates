import type { HealthResponse, Readiness } from '@/models/health/interface'

import { getApiHealth, getApiHealthReady } from './generated/sdk.gen'

// The facade over the health module of the generated SDK. A facade returns the call's `data`; a
// failure rejects with the ApiError the error interceptor built (the client is configured with
// `throwOnError`, and each call repeats it so the result type has no error branch).
export const healthService = {
  async get(): Promise<HealthResponse> {
    const { data } = await getApiHealth({ throwOnError: true })
    return data
  },

  async ready(): Promise<Readiness> {
    const { data } = await getApiHealthReady({ throwOnError: true })
    return data
  },
}
