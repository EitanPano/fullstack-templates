'use client'

// Error boundaries must be Client Components. Keep the message user-safe; the cause is in
// the server log under its request id.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p>The page could not be loaded. Try again, or refresh if the problem persists.</p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded-md border px-3 py-1 text-sm hover:bg-foreground/5"
      >
        Try again
      </button>
    </main>
  )
}
