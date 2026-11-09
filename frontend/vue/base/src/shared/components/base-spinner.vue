<script setup lang="ts">
// A busy indicator. Alone it is a status region with a translated label; inside a control that
// already says it is busy (the button) it is `decorative` and silent.
withDefaults(defineProps<{ labelKey?: string; decorative?: boolean }>(), {
  labelKey: 'app.loading',
  decorative: false,
})
</script>

<template>
  <span v-if="decorative" class="spinner" aria-hidden="true">
    <span class="spinner__ring" />
  </span>
  <span v-else class="spinner" role="status">
    <span class="spinner__ring" aria-hidden="true" />
    <span class="visually-hidden">{{ $t(labelKey) }}</span>
  </span>
</template>
