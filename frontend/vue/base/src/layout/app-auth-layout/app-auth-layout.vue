<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { DISPLAY_NAME } from '@/core/config/constants'
import { useThemeStore } from '@/store/theme.store'

import AppToastHost from '../app-toast-host/app-toast-host.vue'

// The frame of the sign-in, register and verification screens: a skip link, the product name
// linking home, one centred <main id="main">. A visitor has nowhere else to go yet. The toast host stays,
// because the store toasts a failed sign-in.
const main = useTemplateRef<HTMLElement>('main')
// The saved choice (and the OS preference, for system) applies through the theme store, which
// each layout owns.
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
  </div>
  <AppToastHost />
</template>

<style lang="scss" src="./app-auth-layout.scss"></style>
