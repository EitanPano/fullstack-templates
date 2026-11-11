import Link from 'next/link'

import { Button } from '@/shared/components/button/button'
import './not-found.scss'

// The fallback for a URL outside every route group; the site group has its own inside `main`.
export default function NotFound() {
  return (
    <main className="root-not-found">
      <h1 className="root-not-found__title">Page not found</h1>
      <Button asChild variant="link" className="root-not-found__back">
        <Link href="/">Back to the start</Link>
      </Button>
    </main>
  )
}
