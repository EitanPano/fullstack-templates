import { Link } from 'react-router'

import { Button } from '@/shared/components/button'
import { EmptyState } from '@/shared/components/empty-state'

// A URL no route claims. It says so and names the way back, inside the shell.
export function Component() {
  return (
    <EmptyState
      className="not-found"
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
