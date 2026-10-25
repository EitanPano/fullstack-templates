'use client'

import { Button } from '@/shared/ui/button'

// Error boundaries must be Client Components. Keep the message user-safe; the cause is in
// the server log under its request id.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p>The page could not be loaded. Try again, or refresh if the problem persists.</p>
      <Button onClick={reset} className="w-fit">
        Try again
      </Button>
    </div>
  )
}
