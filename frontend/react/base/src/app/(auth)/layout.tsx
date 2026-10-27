import { Outlet } from 'react-router'

// The frame of the sign-in and sign-up screens: no shell, one centred `main`. The screen's card
// supplies the page's `h1`. An account that is already signed in never sees these screens: the
// routes' loaders send it home.
export default function AuthLayout() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-8"
    >
      <Outlet />
    </main>
  )
}
