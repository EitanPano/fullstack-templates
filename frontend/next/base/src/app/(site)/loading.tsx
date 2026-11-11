import { Page } from '@/shared/components/page/page'
import { Skeleton } from '@/shared/components/skeleton/skeleton'

// The loading state of every route in the group: a header-shaped placeholder.
export default function Loading() {
  return (
    <Page role="status" aria-label="Loading" aria-busy="true">
      <Skeleton shape="title" />
      <Skeleton shape="short" />
    </Page>
  )
}
