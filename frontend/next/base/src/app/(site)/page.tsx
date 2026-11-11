import type { Metadata } from 'next'

import { Page, PageHeader } from '@/shared/components/page'
import './page.scss'

export const metadata: Metadata = { title: 'Home' }

// The index route: the product's name as the one `h1`, through the page pattern. Replace it.
export default function HomePage() {
  return (
    <Page className="home-page">
      <PageHeader
        title="__PROJECT_DISPLAY_NAME__"
        description="Replace this page with the first screen."
      />
    </Page>
  )
}
