import { ref } from 'vue'

// Stands in for the plugin's virtual module under Vitest (vitest.config.mts aliases it here), which
// has no service worker. A spec that cares mocks the module itself.
export function useRegisterSW() {
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker: (): Promise<void> => Promise.resolve(),
  }
}
