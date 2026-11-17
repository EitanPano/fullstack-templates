// theme-toggle.ts belongs: the behaviour of theme-toggle.astro: on a click it stores the next
// choice, applies it and renames the button. The choice and its storage are services/theme.ts.
// It does not belong: the markup (theme-toggle.astro) or the logic (services/theme.ts).
import { UI_COPY } from '../../../models/ui/constant'
import type { ThemeChoice } from '../../../models/theme/type'
import { applyTheme, nextTheme, readTheme, writeTheme } from '../../../services/theme'

const NAME: Record<ThemeChoice, string> = { light: 'light', dark: 'dark', system: 'system' }

// Wires every `[data-theme-toggle]` under `root`; returns the toggles it wired.
export function initThemeToggle(root: ParentNode = document): HTMLElement[] {
  const toggles = [...root.querySelectorAll<HTMLElement>('[data-theme-toggle]')]
  const dark = matchMedia('(prefers-color-scheme: dark)')

  const render = (toggle: HTMLElement, choice: ThemeChoice) => {
    const next = nextTheme(choice)
    toggle
      .querySelector('[data-theme-toggle-button]')
      ?.setAttribute('aria-label', UI_COPY.themeToggle(NAME[choice], NAME[next]))
    const status = toggle.querySelector('[data-theme-toggle-status]')
    if (status) status.textContent = UI_COPY.themeCurrent(NAME[choice])
    toggle.dataset.choice = choice
  }

  for (const toggle of toggles) {
    let choice = readTheme(localStorage)
    render(toggle, choice)
    toggle.querySelector('[data-theme-toggle-button]')?.addEventListener('click', () => {
      choice = nextTheme(choice)
      writeTheme(localStorage, choice)
      applyTheme(document.documentElement, choice, dark.matches)
      render(toggle, choice)
    })
  }
  // A system choice follows the OS while the page is open.
  dark.addEventListener('change', () => {
    if (readTheme(localStorage) === 'system') {
      applyTheme(document.documentElement, 'system', dark.matches)
    }
  })
  return toggles
}
