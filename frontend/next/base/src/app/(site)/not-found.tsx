import Link from 'next/link'

import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/pattern/empty-state'

export default function SiteNotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you asked for does not exist."
      action={
        <Button asChild>
          <Link href="/">Back to the start</Link>
        </Button>
      }
    />
  )
}
