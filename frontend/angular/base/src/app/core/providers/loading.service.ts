import { Injectable, computed, signal } from '@angular/core'

// The count of requests in flight. The loading interceptor calls start() and stop() around each
// request; `busy` is true while any is pending.
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pending = signal(0)

  readonly busy = computed(() => this.pending() > 0)

  start(): void {
    this.pending.update((count) => count + 1)
  }

  stop(): void {
    this.pending.update((count) => Math.max(0, count - 1))
  }
}
