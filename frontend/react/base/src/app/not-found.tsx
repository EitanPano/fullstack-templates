import { Link } from 'react-router'

export default function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="inline-flex min-h-11 w-fit items-center underline">
        Back to the start
      </Link>
    </>
  )
}
