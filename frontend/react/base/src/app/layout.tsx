import { Outlet } from 'react-router'

// The shell every route renders inside: the page's single landmark and its width.
export default function RootLayout() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <Outlet />
    </main>
  )
}
