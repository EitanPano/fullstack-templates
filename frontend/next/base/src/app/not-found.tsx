import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="w-fit underline">
        Back to the start
      </Link>
    </main>
  )
}
