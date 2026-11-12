// One top-level route in pp/nav.ts. It lives here, not in pp/, so the navigation a product
// builds in layout/ can take the table as a prop.
export interface NavEntry {
  href: string
  label: string
}
