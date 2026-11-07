import { client } from '@app/services/generated/client.gen'
import { provideHeyApiClient } from '@app/services/generated/client/client.gen'

// Hands the Angular `HttpClient` (and so every interceptor) to the generated client. This is the one
// core/config file that imports the generated client runtime (the lint rule names it). It is not
// api-client.ts because the generated client.gen.ts imports that file while it is evaluated, so a
// value import of the client there would be a cycle.
export function provideApiClient() {
  return provideHeyApiClient(client)
}
