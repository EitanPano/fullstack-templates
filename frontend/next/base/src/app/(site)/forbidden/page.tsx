import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/shared/ui/button'
import { Page, PageHeader } from '@/shared/ui/pattern/page-layout'

export const metadata: Metadata = { title: 'Access denied', robots: { index: false } }

// Where `requireRole` sends a signed-in account whose role is not enough. A plain page at a
// stable URL (no experimental Next API), inside the shell; it says nothing about what the page
// it came from would have held.
export default function ForbiddenPage() {
  return (
    <Page>
      <PageHeader
        title="Access denied"
        description="Your account does not have access to this page."
      />
      <Button asChild className="w-fit">
        <Link href="/">Back to the start</Link>
      </Button>
    </Page>
  )
}
