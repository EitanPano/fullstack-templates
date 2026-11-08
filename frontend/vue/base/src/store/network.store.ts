import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'

// Whether the browser reports a connection: navigator.onLine at start, then the window's online
// and offline events. The header's offline badge reads it.
export const useNetworkStore = defineStore('network', () => {
  const online = ref(navigator.onLine)

  const goOnline = () => {
    online.value = true
  }
  const goOffline = () => {
    online.value = false
  }
  window.addEventListener('online', goOnline)
  window.addEventListener('offline', goOffline)
  onScopeDispose(() => {
    window.removeEventListener('online', goOnline)
    window.removeEventListener('offline', goOffline)
  })

  return { online }
})
