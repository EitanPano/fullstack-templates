<script setup lang="ts">
import BaseButton from './base-button.vue'
import BaseIcon from './base-icon.vue'

// What a page or region shows when its data failed to load. The copy follows the error (see
// AGENTS.md > Errors); the defaults are the generic ones. `retry` fires when the button is pressed.
// `heading` and `description` arrive already translated.
withDefaults(defineProps<{ heading?: string; description?: string; retryable?: boolean }>(), {
  heading: undefined,
  description: undefined,
  retryable: true,
})
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="error-state" role="alert">
    <span class="error-state__icon"><BaseIcon name="alert-circle" large /></span>
    <h2>{{ heading ?? $t('errors.title') }}</h2>
    <p class="error-state__description">{{ description ?? $t('errors.description') }}</p>
    <BaseButton v-if="retryable" variant="secondary" @click="$emit('retry')">{{
      $t('actions.retry')
    }}</BaseButton>
  </div>
</template>

<style lang="scss" src="./error-state.scss"></style>
