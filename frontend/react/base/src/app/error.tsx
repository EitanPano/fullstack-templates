// Last-resort boundary for what no segment caught. Keep the message user-safe: no stack, no
// internal URL. It is a whole page because the layout it would sit in has failed.
export default function RootError() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p>The app could not be shown. Reload the page, or try again later.</p>
    </main>
  )
}
