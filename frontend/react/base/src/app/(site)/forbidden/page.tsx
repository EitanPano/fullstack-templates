import { Link } from 'react-router'

import { Button } from '@/shared/ui/button'
import { Page, PageHeader } from '@/shared/ui/pattern/page-layout'

// Where `requireRole` sends a signed-in account whose role is not enough. A plain page at a
// stable URL, inside the shell; it says nothing about what the page it came from would have held.
export default function ForbiddenPage() {
  return (
    <Page>
      <title>Access denied · __PROJECT_DISPLAY_NAME__</title>
      {/* Only a hint to crawlers that run no script; the loader's guard is the protection. */}
      <meta name="robots" content="noindex" />
      <PageHeader
        title="Access denied"
        description="Your account does not have access to this page."
      />
      <Button asChild className="w-fit">
        <Link to="/">Back to the start</Link>
      </Button>
    </Page>
  )
}
