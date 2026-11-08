import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each test starts from fresh modules, so the shared i18n instance has only English in it and the
// Hebrew table has not been loaded yet.
async function fresh(languages: string[] = ['en-US']) {
  vi.resetModules()
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages)
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useLanguageStore } = await import('./language.store')
  const { i18n } = await import('@/core/i18n/i18n')
  return { store: useLanguageStore(), i18n }
}

const root = document.documentElement

describe('language store', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/core/i18n/translations/he.json')
    root.setAttribute('lang', 'en')
    root.setAttribute('dir', 'ltr')
  })

  it('starts in English with the other language next', async () => {
    const { store } = await fresh()

    expect(store.code).toBe('en')
    expect(store.dir).toBe('ltr')
    expect(store.next.code).toBe('he')
  })

  it('wraps around: the language after the last is the first', async () => {
    const { store } = await fresh()

    await store.setLang('he')

    expect(store.next.code).toBe('en')
  })

  it('switches lang and dir, loads the table, writes <html lang dir> and persists the choice', async () => {
    const { store, i18n } = await fresh()
    expect(Object.keys(i18n.global.getLocaleMessage('he'))).toHaveLength(0)

    await expect(store.setLang('he')).resolves.toBe(true)

    expect(store.code).toBe('he')
    expect(store.dir).toBe('rtl')
    expect(i18n.global.locale.value).toBe('he')
    expect(i18n.global.t('nav.home')).toBe('דף הבית')
    expect(root.getAttribute('lang')).toBe('he')
    expect(root.getAttribute('dir')).toBe('rtl')
    expect(localStorage.getItem('lang')).toBe('"he"')
  })

  it('switches back to English without loading anything', async () => {
    const { store, i18n } = await fresh()
    await store.setLang('he')

    await store.setLang('en')

    expect(i18n.global.locale.value).toBe('en')
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(localStorage.getItem('lang')).toBe('"en"')
  })

  it('does not persist when asked not to', async () => {
    const { store } = await fresh()

    await store.setLang('he', false)

    expect(store.code).toBe('he')
    expect(localStorage.getItem('lang')).toBeNull()
  })

  it('refuses an unknown code and changes nothing', async () => {
    const { store } = await fresh()

    await expect(store.setLang('fr')).resolves.toBe(false)

    expect(store.code).toBe('en')
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(localStorage.getItem('lang')).toBeNull()
  })

  it('keeps the current language and logs when the table cannot load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.doMock('@/core/i18n/translations/he.json', () => {
      throw new Error('offline')
    })
    const { store, i18n } = await fresh()

    await expect(store.setLang('he')).resolves.toBe(false)

    expect(store.code).toBe('en')
    expect(i18n.global.locale.value).toBe('en')
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(localStorage.getItem('lang')).toBeNull()
    expect(error).toHaveBeenCalledOnce()
  })

  describe('initial', () => {
    it('prefers the saved choice over the browser language', async () => {
      localStorage.setItem('lang', '"he"')
      const { store } = await fresh(['en-US'])

      expect(store.initial()).toBe('he')
    })

    it('ignores a saved value that is not a language', async () => {
      localStorage.setItem('lang', '"fr"')
      const { store } = await fresh(['he-IL'])

      expect(store.initial()).toBe('he')
    })

    it('takes the first browser language the app has a table for', async () => {
      const { store } = await fresh(['fr-FR', 'he-IL', 'en-US'])

      expect(store.initial()).toBe('he')
    })

    it('falls back to English when nothing matches', async () => {
      const { store } = await fresh(['fr-FR'])

      expect(store.initial()).toBe('en')
    })
  })
})
