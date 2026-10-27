import { Link } from 'react-router'

import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/pattern/empty-state'

// Rendered by the catch-all route, so an unknown URL keeps the shell.
export default function SiteNotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you asked for does not exist."
      action={
        <Button asChild>
          <Link to="/">Back to the start</Link>
        </Button>
      }
    />
  )
}
