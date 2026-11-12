<script setup lang="ts">
import { ToastProvider, ToastViewport } from 'reka-ui'

// The provider and viewport a toast list renders inside (Reka Toast): the layout names the labels
// and puts the toasts in the slot. Reka owns the timers and pauses them while the list is hovered
// or focused. Attributes (the class) land on the viewport.
defineOptions({ inheritAttrs: false })
defineProps<{ label: string; viewportLabel: string }>()
</script>

<template>
  <ToastProvider :label="label">
    <slot />
    <ToastViewport v-bind="$attrs" :label="viewportLabel" />
  </ToastProvider>
</template>
