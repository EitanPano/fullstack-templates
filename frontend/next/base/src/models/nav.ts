// One top-level route in `app/nav.ts`. It lives here, not in `app/`, so the navigation a product
// builds in `components/` can take the table as a prop.
export type NavEntry = { href: string; label: string }
