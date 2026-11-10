import Link from 'next/link'

import { Button } from '@/shared/ui/button'
import { EmptyState } from '@/shared/ui/pattern/empty-state'
import { Page } from '@/shared/ui/pattern/page-layout'

export default function SiteNotFound() {
  return (
    <Page>
      <EmptyState
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
