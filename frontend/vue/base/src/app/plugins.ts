import { createPinia } from 'pinia'
import { storeToRefs } from 'pinia' // @server:auth
import type { App } from 'vue'

import { router } from '@/app/router'
import { installGlobalErrorHandler } from '@/core/errors/global-error-handler'
import { env } from '@/core/config/env'
import { initializeI18n } from '@/core/initializers/i18n.initializer' // @i18n
import { initPwa } from '@/core/initializers/pwa.initializer' // @pwa
import { initSession } from '@/core/initializers/session.initializer' // @server:auth
import { installInterceptors } from '@/core/interceptors/http.provider' // @server
import { i18n } from '@/core/i18n/i18n'
import { DEV_KEY } from '@/shared/composables/dev-mode'
import { createHasRoleDirective } from '@/shared/directives/has-role' // @server:auth
import { ROLES_KEY } from '@/shared/directives/roles' // @server:auth
import { useAuthStore } from '@/store/auth.store' // @server:auth
import { useNotificationStore } from '@/store/notification.store'

// Everything the app installs, in one place and in order. `main.ts` calls it once and mounts when the
// promise resolves, which awaits what the first render needs (the saved language's copy table).
// Pinia goes in before the router, so a guard may read a store.
export function installPlugins(app: App): Promise<void> {
  app.use(createPinia())
  app.use(router)
  app.use(i18n)
  installInterceptors() // @server
  app.provide(DEV_KEY, env.isDev)
  installGlobalErrorHandler(app, () => {
    useNotificationStore().showError('errors.unexpected')
  })
  // @server:auth-start
  // One roles ref from the auth store serves both halves: the directive (a hook cannot inject) and
  // ROLES_KEY for components (a product's navigation). The restore starts here and never blocks
  // the mount.
  const { roles } = storeToRefs(useAuthStore())
  app.directive('has-role', createHasRoleDirective(roles))
  app.provide(ROLES_KEY, roles)
  initSession(router)
  // @server:auth-end
  initPwa() // @pwa
  const ready: Promise<void>[] = []
  ready.push(initializeI18n()) // @i18n
  return Promise.all(ready).then(() => undefined)
}
