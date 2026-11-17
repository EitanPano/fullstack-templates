// services/theme.ts and public/theme-init.js: the page's theme logic and the no-flash script that
// must read exactly what the logic writes.
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME, THEME_KEY } from '../../src/models/theme/constant'
import {
  nextTheme,
  readTheme,
  resolveTheme,
  toTheme,
  writeTheme,
} from '../../src/services/theme'

function storage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  }
}

describe('theme logic', () => {
  it('reads only the three choices', () => {
    expect(toTheme('dark')).toBe('dark')
    expect(toTheme('system')).toBe('system')
    expect(toTheme('purple')).toBeNull()
    expect(toTheme(null)).toBeNull()
  })

  it('cycles light, dark, system', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('system')
    expect(nextTheme('system')).toBe('light')
  })

  it('reads the stored choice, else the brand default, else system', () => {
    expect(readTheme(storage({ [THEME_KEY]: 'dark' }))).toBe('dark')
    expect(readTheme(storage({ [THEME_KEY]: 'junk' }), 'light')).toBe('light')
    expect(readTheme(storage(), 'nonsense')).toBe('system')
  })

  it('survives a storage that throws', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readTheme(blocked, 'dark')).toBe('dark')
    expect(() =>
      writeTheme(
        {
          setItem: () => {
            throw new Error('blocked')
          },
        },
        'dark',
      ),
    ).not.toThrow()
  })

  it('resolves system by the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
  })
})

describe('public/theme-init.js', () => {
  const source = readFileSync('public/theme-init.js', 'utf8')

  function run(stored: string | null, prefersDark = false): string | undefined {
    const root = { dataset: {} as Record<string, string> }
    vm.runInNewContext(source, {
      document: { documentElement: root },
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: prefersDark }),
    })
    return root.dataset.theme
  }

  it('applies the choices the services write', () => {
    const written = storage()
    for (const choice of ['light', 'dark'] as const) {
      writeTheme(written, choice)
      expect(run(written.getItem(THEME_KEY))).toBe(choice)
    }
  })

  it('follows the OS for a stored system choice and for none', () => {
    expect(run('system', true)).toBe('dark')
    expect(run('system', false)).toBe('light')
    // With nothing stored the brand's default decides: dark, or the OS for light and system.
    expect(run(null, false)).toBe(DEFAULT_THEME === 'dark' ? 'dark' : 'light')
  })

  it('leaves the page light when storage is blocked', () => {
    const root = { dataset: {} as Record<string, string> }
    vm.runInNewContext(source, {
      document: { documentElement: root },
      localStorage: {
        getItem: () => {
          throw new Error('blocked')
        },
      },
      matchMedia: () => ({ matches: true }),
    })
    expect(root.dataset.theme).toBeUndefined()
  })

  it('is a plain script with no network or eval of its own', () => {
    expect(source).not.toMatch(/fetch\(|eval\(|new Function/)
  })
})
