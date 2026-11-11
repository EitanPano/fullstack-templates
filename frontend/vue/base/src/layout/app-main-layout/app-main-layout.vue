<script setup lang="ts">
import { useTemplateRef } from 'vue'

import { useThemeStore } from '@/store/theme.store'

import AppToastHost from '../app-toast-host/app-toast-host.vue'

// The shell of every feature route: the skip link, the one `main` and the toast list, nothing
// else. A product's header, navigation and footer go between the skip link and `main`
// (AGENTS.md, "The shell"). `main` has no width and no padding: a page wraps its content in
// `shared/components/page-container.vue`, and a full-bleed page leaves it out.
const main = useTemplateRef<HTMLElement>('main')
// The theme store follows the OS while the choice is system, and only while it exists: the layout
// owns it, whatever theme control a product places.
useThemeStore()

// A plain anchor would put #main in the URL and the router would navigate to it; this focuses
// the target, which the browser then scrolls to.
function skipToMain(): void {
  main.value?.focus()
}
</script>

<template>
  <div class="shell">
    <a class="skip-link" href="#main" @click.prevent="skipToMain">{{ $t('app.skipToContent') }}</a>
    <main id="main" ref="main" class="main" tabindex="-1">
      <RouterView />
    </main>
    <AppToastHost />
  </div>
</template>
