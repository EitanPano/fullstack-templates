import { Outlet } from 'react-router'

// The frame of the sign-in and sign-up screens: no shell, one centred `main`. The screen's card
// supplies the page's `h1`. An account that is already signed in never sees these screens: the
// routes' loaders send it home.
export function AuthLayout() {
  return (
    <main id="main" tabIndex={-1} className="auth-layout">
      <Outlet />
    </main>
  )
}
