import Link from 'next/link'

import { Button } from '@/shared/components/button/button'
import { EmptyState } from '@/shared/components/empty-state/empty-state'
import { Page } from '@/shared/components/page/page'
import './not-found.scss'

export default function SiteNotFound() {
  return (
    <Page>
      <EmptyState
        className="site-not-found"
        title="Page not found"
        description="The page you asked for does not exist."
        action={
          <Button asChild>
            <Link href="/">Back to the start</Link>
          </Button>
        }
      />
    </Page>
  )
}
