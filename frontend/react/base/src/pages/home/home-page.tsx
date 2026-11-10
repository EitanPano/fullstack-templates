import { Page, PageHeader } from '@/shared/components/page'
import './home-page.scss'

// The index route: the product's name as the one `h1`, through the page pattern. Replace it.
function HomePage() {
  return (
    <Page className="home-page">
      <title>__PROJECT_DISPLAY_NAME__</title>
      <PageHeader
        title="__PROJECT_DISPLAY_NAME__"
        description="Replace this page with the first screen."
      />
    </Page>
  )
}

export { HomePage as Component }
