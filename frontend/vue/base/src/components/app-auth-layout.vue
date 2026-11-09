<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { DISPLAY_NAME } from '@/core/config/constants'
import { useThemeStore } from '@/store/theme.store'

import AppFooter from './app-footer.vue'
import AppToastHost from './app-toast-host.vue'

// The frame of the sign-in, register and verification screens: a skip link, the product name
// linking home, one centred <main id="main"> and the footer. No header and no side nav: a visitor
// has nowhere else to go yet. The toast host stays, because the store toasts a failed sign-in.
const main = useTemplateRef<HTMLElement>('main')
// The header owns the theme store on the other screens; this frame has no header, but the saved
// choice (and the OS preference, for system) must still apply here.
useThemeStore()

// A plain anchor would put #main in the URL and the router would navigate to it; this focuses
// the target, which the browser then scrolls to.
function skipToMain(): void {
  main.value?.focus()
}
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="skipToMain">{{ $t('app.skipToContent') }}</a>
  <div class="auth-layout">
    <RouterLink class="auth-layout__brand" to="/">{{ DISPLAY_NAME }}</RouterLink>
    <main id="main" ref="main" class="auth-layout__main" tabindex="-1">
      <RouterView />
    </main>
    <AppFooter class="auth-layout__footer" />
  </div>
  <AppToastHost />
</template>

<style lang="scss" src="./app-auth-layout.scss"></style>
