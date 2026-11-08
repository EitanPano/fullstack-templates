<script setup lang="ts">
// The page's one h1, an optional description, and an `actions` slot on the right. `heading` and
// `description` arrive already translated.
defineProps<{ heading: string; description?: string }>()
</script>

<template>
  <div class="page-header">
    <div>
      <h1>{{ heading }}</h1>
      <p v-if="description" class="page-header__description">{{ description }}</p>
    </div>
    <div class="page-header__actions"><slot name="actions" /></div>
  </div>
</template>
