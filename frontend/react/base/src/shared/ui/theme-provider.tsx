import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

// The brand's default arrives as a string from the generator; anything unknown reads as `system`.
export function toTheme(value: string): Theme {
  return isTheme(value) ? value : 'system'
}

function readStored(fallback: Theme): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : fallback
  } catch {
    return fallback
  }
}

function isDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && window.matchMedia(DARK_QUERY).matches)
}

type ThemeContext = { theme: Theme; setTheme: (theme: Theme) => void }

const Context = createContext<ThemeContext | undefined>(undefined)

// The class strategy: the `dark` class on <html>, chosen from the stored theme or the brand's
// default and, for `system`, from the OS preference (followed while the page is open). The class
// is first set by public/theme-init.js before paint; this keeps it in step afterwards.
export function ThemeProvider({
  defaultTheme,
  children,
}: {
  defaultTheme: Theme
  children: ReactNode
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStored(defaultTheme))

  useEffect(() => {
    const apply = () => {
      document.documentElement.classList.toggle('dark', isDark(theme))
    }
    apply()
    if (theme !== 'system') return
    const media = window.matchMedia(DARK_QUERY)
    media.addEventListener('change', apply)
    return () => {
      media.removeEventListener('change', apply)
    }
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Blocked storage: the choice lasts until the page closes.
    }
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <Context value={value}>{children}</Context>
}

export function useTheme(): ThemeContext {
  const context = use(Context)
  if (!context) throw new Error('useTheme needs a ThemeProvider')
  return context
}
