import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider, toTheme, useTheme, type Theme } from '@/shared/ui/theme-provider'

function Probe() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <p data-testid="theme">{theme}</p>
      <button
        type="button"
        onClick={() => {
          setTheme('dark')
        }}
      >
        dark
      </button>
      <button
        type="button"
        onClick={() => {
          setTheme('light')
        }}
      >
        light
      </button>
      <button
        type="button"
        onClick={() => {
          setTheme('system')
        }}
      >
        system
      </button>
    </>
  )
}

// jsdom has no matchMedia that reports a preference; vitest.setup stubs one that never matches.
// Tests that need an OS preference install their own.
function osPrefers(dark: boolean) {
  const listeners = new Set<() => void>()
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: dark,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }))
  return {
    change(next: boolean) {
      dark = next
      listeners.forEach((listener) => {
        listener()
      })
    },
  }
}

function renderProvider(defaultTheme: Theme = 'system') {
  return render(
    <ThemeProvider defaultTheme={defaultTheme}>
      <Probe />
    </ThemeProvider>,
  )
}

const isDark = () => document.documentElement.classList.contains('dark')

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('starts from the brand default when nothing is stored', () => {
    osPrefers(false)
    renderProvider('dark')

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(isDark()).toBe(true)
  })

  it('prefers a stored choice to the default', () => {
    osPrefers(false)
    localStorage.setItem('theme', 'light')
    renderProvider('dark')

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(isDark()).toBe(false)
  })

  it('ignores a stored value that is not a theme', () => {
    osPrefers(false)
    localStorage.setItem('theme', 'purple')
    renderProvider('light')

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
  })

  it('switches the class and stores the choice', async () => {
    osPrefers(false)
    renderProvider('light')

    await userEvent.click(screen.getByRole('button', { name: 'dark' }))
    expect(isDark()).toBe(true)
    expect(localStorage.getItem('theme')).toBe('dark')

    await userEvent.click(screen.getByRole('button', { name: 'light' }))
    expect(isDark()).toBe(false)
  })

  it('follows the OS preference for system, while the page is open', () => {
    const os = osPrefers(false)
    renderProvider('system')
    expect(isDark()).toBe(false)

    act(() => {
      os.change(true)
    })
    expect(isDark()).toBe(true)
  })

  it('starts from the default when storage cannot be read', () => {
    osPrefers(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    renderProvider('dark')

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(isDark()).toBe(true)
    vi.restoreAllMocks()
  })

  it('still switches when storage is blocked', async () => {
    osPrefers(false)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    renderProvider('light')

    await userEvent.click(screen.getByRole('button', { name: 'dark' }))

    expect(isDark()).toBe(true)
    vi.restoreAllMocks()
  })

  it('reads the generated default, and falls back to system for anything else', () => {
    expect(toTheme('dark')).toBe('dark')
    expect(toTheme('light')).toBe('light')
    expect(toTheme('')).toBe('system')
    expect(toTheme('sepia')).toBe('system')
  })

  it('needs a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    expect(() => render(<Probe />)).toThrow(/ThemeProvider/)
  })
})
