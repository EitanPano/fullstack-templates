<script setup lang="ts">
import BaseIcon from './base-icon.vue'
import type { IconName } from './icons'

// What a list shows when it has nothing: an icon, a title, a description and, in the `actions`
// slot, the way to add the first item. `heading` and `description` arrive already translated.
withDefaults(defineProps<{ heading: string; description?: string; icon?: IconName }>(), {
  description: undefined,
  icon: 'inbox',
})
</script>

<template>
  <div class="empty-state">
    <span class="empty-state__icon"><BaseIcon :name="icon" large /></span>
    <h2>{{ heading }}</h2>
    <p v-if="description" class="empty-state__description">{{ description }}</p>
    <div class="empty-state__actions"><slot name="actions" /></div>
  </div>
</template>
