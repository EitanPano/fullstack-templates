import { Link } from 'react-router'

export default function NotFound() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link to="/" className="w-fit underline">
        Back to the start
      </Link>
    </>
  )
}
