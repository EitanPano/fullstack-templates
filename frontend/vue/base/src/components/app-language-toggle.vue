<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/shared/components/base-button.vue'
import { useLanguageStore } from '@/store/language.store'

// The language switch, which the product places: the button names the language it switches to, and a polite
// status line announces the active one.
const language = useLanguageStore()

const nextName = computed(() => `language.name.${language.next.code}`)
const currentName = computed(() => `language.name.${language.code}`)

function switchLanguage(): void {
  void language.setLang(language.next.code)
}
</script>

<template>
  <BaseButton
    class="language-toggle"
    variant="ghost"
    size="sm"
    :aria-label="$t('language.toggle', { name: $t(nextName) })"
    @click="switchLanguage"
  >
    <span :lang="language.next.code">{{ $t(nextName) }}</span>
  </BaseButton>
  <span class="visually-hidden" role="status">
    {{ $t('language.current', { name: $t(currentName) }) }}
  </span>
</template>
