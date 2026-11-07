import type { CreateClientConfig } from '@app/services/generated/client.gen'

// The generated client's configuration, applied where the generator asks for it
// (`runtimeConfigPath`; the generated client.gen.ts imports this file). Calls go to the own
// origin of the page at `/api` (the dev proxy, nginx or the server forward it), so the browser
// sends the HttpOnly cookies of the API itself. `throwOnError` makes a failure reject: the error interceptor has
// already turned it into an `ApiError`. Only types are imported here, because the generated client
// imports this file back: the provider that needs the client itself is api-client.provider.ts.
export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: window.location.origin,
  withCredentials: true,
  throwOnError: true,
})
