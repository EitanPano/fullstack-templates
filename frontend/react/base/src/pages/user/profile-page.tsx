import { ProfileCard } from '@/pages/user/components/profile-card'
import { Page, PageHeader } from '@/shared/components/page'
import './profile-page.scss'

// A page only an account sees: its loader (user.routes.tsx) calls `requireAccount`, the page
// stays a header and a card.
function ProfilePage() {
  return (
    <Page>
      <title>Profile · __PROJECT_DISPLAY_NAME__</title>
      {/* Only a hint to crawlers that run no script; the loader's guard is the protection. */}
      <meta name="robots" content="noindex" />
      <PageHeader title="Profile" />
      <ProfileCard />
    </Page>
  )
}

export { ProfilePage as Component }
