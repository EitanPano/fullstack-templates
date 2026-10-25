import { Outlet } from 'react-router'

import { AppShell } from '@/shared/ui/app-shell'

import { NAV } from './nav'

// The frame every route renders inside; the navigation table is `nav.ts`.
export default function RootLayout() {
  return (
    <AppShell name="__PROJECT_NAME__" nav={NAV}>
      <Outlet />
    </AppShell>
  )
}
