import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// The count of requests in flight. The loading interceptor calls start() before each request and
// stop() in a finally; `busy` is true while any is pending.
export const useLoadingStore = defineStore('loading', () => {
  const pending = ref(0)
  const busy = computed(() => pending.value > 0)

  function start(): void {
    pending.value += 1
  }

  function stop(): void {
    pending.value = Math.max(0, pending.value - 1)
  }

  return { pending, busy, start, stop }
})
