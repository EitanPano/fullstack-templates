<script setup lang="ts">
import { ref, useTemplateRef } from 'vue'

import type { NavEntry } from '@/models/nav/interface'

import AppFooter from '../components/app-footer.vue'
import AppHeader from '../components/app-header.vue'
import SideNav from '../components/side-nav.vue'
import ToastHost from '../components/toast-host.vue'

// The shell of every feature route: skip link, banner, navigation, `main`, footer and the toast
// list. `nav` arrives as a route prop (app/routes.ts), because layout/ may not import app/. While
// the drawer covers the page the content behind it is inert, so Tab and the pointer stay inside.
defineProps<{ nav: readonly NavEntry[] }>()

const drawerOpen = ref(false)
const main = useTemplateRef<HTMLElement>('main')

// A plain anchor would put #main in the URL and the router would navigate to it; this focuses
// the target, which the browser then scrolls to.
function skipToMain(): void {
  main.value?.focus()
}
</script>

<template>
  <a class="skip-link" href="#main" @click.prevent="skipToMain">{{ $t('app.skipToContent') }}</a>
  <div class="shell">
    <AppHeader
      class="shell__header"
      :nav-open="drawerOpen"
      @nav-toggle="drawerOpen = !drawerOpen"
    />
    <SideNav v-model:open="drawerOpen" class="shell__nav" :entries="nav" />
    <main id="main" ref="main" class="main" tabindex="-1" :inert="drawerOpen || undefined">
      <RouterView />
    </main>
    <AppFooter class="shell__footer" :inert="drawerOpen || undefined" />
  </div>
  <ToastHost />
</template>
