// The first control in the tab order: it moves focus to the page's `main` (`id="main"`).
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:inline-flex focus:h-11 focus:items-center focus:rounded-md focus:bg-primary focus:px-4 focus:text-primary-foreground"
    >
      Skip to content
    </a>
  )
}
