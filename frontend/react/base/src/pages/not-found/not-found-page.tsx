import { Link } from 'react-router'

import { Button } from '@/shared/components/button'
import { EmptyState } from '@/shared/components/empty-state'
import { Page } from '@/shared/components/page'
import './not-found-page.scss'

// A URL no route claims. It says so and names the way back, inside main.
export function Component() {
  return (
    <Page>
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
    </Page>
  )
}
