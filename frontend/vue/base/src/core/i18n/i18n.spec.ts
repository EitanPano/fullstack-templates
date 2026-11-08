import { isRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { warnMissingKey } from './missing-key.handler'
import { createAppI18n } from './i18n'
import en from './translations/en.json'

describe('createAppI18n', () => {
  it('translates a key of the bundled English table, with named parameters', () => {
    const i18n = createAppI18n()

    expect(i18n.global.t('app.skipToContent')).toBe('Skip to content')
    expect(i18n.global.t('shell.footer', { year: 2030, name: 'Acme' })).toBe('© 2030 Acme')
  })

  it('runs in the Composition API mode with English as locale and fallback', () => {
    const i18n = createAppI18n()

    expect(isRef(i18n.global.locale)).toBe(true)
    expect(i18n.global.locale.value).toBe('en')
    expect(i18n.global.fallbackLocale.value).toBe('en')
  })

  it('returns the key itself for a missing one', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(createAppI18n().global.t('no.such.key')).toBe('no.such.key')

    warn.mockRestore()
  })
})

describe('the copy table', () => {
  // vue-i18n reads `@`, `|`, `{` and `}` as syntax: a literal one is written {'@'}.
  it('holds no unescaped message syntax beyond {param} placeholders', () => {
    const values: string[] = []
    const walk = (node: unknown): void => {
      if (typeof node === 'string') values.push(node)
      else if (node && typeof node === 'object') Object.values(node).forEach(walk)
    }
    walk(en)

    for (const value of values) {
      expect(value.replace(/\{[A-Za-z]+\}/g, '')).not.toMatch(/[@|{}]/)
    }
  })
})

describe('warnMissingKey', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns about a missing key outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    warnMissingKey('en', 'a.b', false)

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a.b'))
  })

  it('stays silent in production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    warnMissingKey('en', 'a.b', true)

    expect(warn).not.toHaveBeenCalled()
  })
})
