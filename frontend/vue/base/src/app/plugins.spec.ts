import { useNotificationStore } from '@/store/notification.store'
import { createApp } from 'vue'
import { inject } from 'vue' // @server:auth
import { client } from '@/services/generated/client.gen'
import { describe, expect, it, vi } from 'vitest'

import { i18n } from '@/core/i18n/i18n' // @i18n
import { setSessionHint } from '@/core/providers/session' // @server:auth
import { ROLES_KEY } from '@/shared/directives/roles' // @server:auth
import { useAuthStore } from '@/store/auth.store' // @server:auth
import { USER } from '@/testing/auth-fixtures' // @server:auth
import { stubApi } from '@/testing/stub-api' // @server:auth
import { Blank } from '@/testing/stubs'

import { installPlugins } from './plugins'
import { router } from './router'

describe('installPlugins', () => {
  it('installs pinia, the router and i18n on the app', async () => {
    const app = createApp(Blank)

    await installPlugins(app)

    expect(app.config.globalProperties.$router).toBe(router)
    expect(app.config.globalProperties.$pinia).toBeDefined()
    expect(app.config.globalProperties.$t('app.skipToContent')).toBe('Skip to content')
  })

  it('registers the error interceptor on the generated client', async () => {
    await installPlugins(createApp(Blank))

    expect(client.interceptors.error.fns.length).toBeGreaterThan(0)
  })

  it('answers an error a component threw with one errors.unexpected toast', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const app = createApp(Blank)
    await installPlugins(app)

    app.config.errorHandler?.(new Error('boom'), null, 'render')

    const toasts = useNotificationStore().toasts
    expect(toasts.map((toast) => toast.messageKey)).toEqual(['errors.unexpected'])
  })

  // @server:auth-start
  describe('with auth', () => {
    it('registers v-has-role and provides the roles of the signed-in account', async () => {
      const app = createApp(Blank)
      await installPlugins(app)

      const roles = app.runWithContext(() => inject(ROLES_KEY))
      expect(app.directive('has-role')).toBeTypeOf('object')
      expect(roles?.value).toEqual([])
      useAuthStore().user = USER
      expect(roles?.value).toEqual(['user'])
    })

    it('starts the session restore without waiting for it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        setSessionHint()
        const fetchMock = stubApi({
          'GET /api/user/me': () => new Promise<Response>(() => undefined),
        })

        await installPlugins(createApp(Blank))

        expect(useAuthStore().restoring).toBe(true)
        expect(fetchMock).toHaveBeenCalledOnce()
      } finally {
        localStorage.clear()
        vi.useRealTimers()
      }
    })
  })
  // @server:auth-end

  // @i18n-start
  it('resolves once the saved language is active, before the app mounts', async () => {
    localStorage.setItem('lang', '"he"')
    const app = createApp(Blank)

    try {
      await installPlugins(app)

      expect(app.config.globalProperties.$t('nav.home')).toBe('דף הבית')
      expect(document.documentElement.getAttribute('dir')).toBe('rtl')
    } finally {
      localStorage.clear()
      i18n.global.locale.value = 'en'
      document.documentElement.setAttribute('lang', 'en')
      document.documentElement.setAttribute('dir', 'ltr')
    }
  })
  // @i18n-end
})
