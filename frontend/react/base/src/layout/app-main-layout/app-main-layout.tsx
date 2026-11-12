import { Outlet } from 'react-router'

// The skeleton every page sits in: the skip link and the one main landmark, nothing else. A
// product's header, navigation and footer go between them (AGENTS.md › The shell). Main has no
// width and no padding: the `Page` pattern owns the container, so a full-bleed screen is a route
// that renders without it.
export function AppMainLayout() {
  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <main id="main" tabIndex={-1} className="main">
        <Outlet />
      </main>
    </div>
  )
}
