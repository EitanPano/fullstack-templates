<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/shared/components/app-button.vue'
import { useLanguageStore } from '@/store/language.store'

// The header's language switch: the button names the language it switches to, and a polite
// status line announces the active one.
const language = useLanguageStore()

const nextName = computed(() => `language.name.${language.next.code}`)
const currentName = computed(() => `language.name.${language.code}`)

function switchLanguage(): void {
  void language.setLang(language.next.code)
}
</script>

<template>
  <AppButton
    class="header__language"
    variant="ghost"
    size="sm"
    :aria-label="$t('language.toggle', { name: $t(nextName) })"
    @click="switchLanguage"
  >
    <span :lang="language.next.code">{{ $t(nextName) }}</span>
  </AppButton>
  <span class="visually-hidden" role="status">
    {{ $t('language.current', { name: $t(currentName) }) }}
  </span>
</template>
