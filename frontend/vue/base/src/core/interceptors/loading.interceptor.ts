import { useLoadingStore } from '@/store/loading.store'

// A fetch wrapper: the loading count goes up before the send and down in a `finally`, so one
// exchange counts once whatever happens. Without `inner` it reads the global fetch on every call,
// and it is the outermost wrapper, so a refresh and its retry count as one.
export function withLoading(inner?: typeof fetch): typeof fetch {
  return async (input, init) => {
    const loading = useLoadingStore()
    const send = inner ?? globalThis.fetch
    loading.start()
    try {
      return await send(input, init)
    } finally {
      loading.stop()
    }
  }
}
