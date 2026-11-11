import { defineStore } from 'pinia'
import { onScopeDispose, ref } from 'vue'

// Whether the browser reports a connection: navigator.onLine at start, then the window's online
// and offline events. A store method that mutates reads it first, and so can a product's offline indicator.
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
