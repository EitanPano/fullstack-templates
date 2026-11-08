import '@fontsource-variable/inter'
import '@/styles/themes/brand.css'
import '@/styles/styles.scss'
import '@/shared/validators/zod-config'
import { createApp } from 'vue'

import App from '@/app/App.vue'
import { installPlugins } from '@/app/plugins'
import { installPreloadReload } from '@/core/initializers/preload-error'

installPreloadReload()

const app = createApp(App)
void installPlugins(app).then(() => {
  app.mount('#app')
})
