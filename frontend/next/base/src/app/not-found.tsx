import Link from 'next/link'

// The fallback for a URL outside every route group; the site group has its own with the shell.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="inline-flex h-11 w-fit items-center underline">
        Back to the start
      </Link>
    </main>
  )
}
