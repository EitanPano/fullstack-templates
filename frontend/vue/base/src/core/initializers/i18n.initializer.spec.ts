import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

async function start(languages: string[] = ['en-US']) {
  vi.resetModules()
  vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages)
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { initializeI18n } = await import('./i18n.initializer')
  const { useLanguageStore } = await import('@/store/language.store')
  await initializeI18n()
  return useLanguageStore()
}

const root = document.documentElement

describe('initializeI18n', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.doUnmock('@/core/i18n/translations/he.json')
    root.setAttribute('lang', 'en')
    root.setAttribute('dir', 'ltr')
  })

  it('activates the saved language with its table loaded before the app starts', async () => {
    localStorage.setItem('lang', '"he"')

    const store = await start()

    expect(store.code).toBe('he')
    expect(root.getAttribute('dir')).toBe('rtl')
  })

  it('uses the browser language when nothing is saved, without saving it', async () => {
    const store = await start(['he-IL'])

    expect(store.code).toBe('he')
    expect(localStorage.getItem('lang')).toBeNull()
  })

  it('stays in English when nothing asks for another language', async () => {
    const store = await start()

    expect(store.code).toBe('en')
    expect(root.getAttribute('dir')).toBe('ltr')
  })

  it('falls back to English when the chosen language cannot load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.doMock('@/core/i18n/translations/he.json', () => {
      throw new Error('offline')
    })
    localStorage.setItem('lang', '"he"')

    const store = await start()

    expect(store.code).toBe('en')
    expect(root.getAttribute('dir')).toBe('ltr')
  })
})
