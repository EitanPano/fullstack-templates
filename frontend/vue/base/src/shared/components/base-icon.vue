<script setup lang="ts">
import { ICONS, type IconName } from './icons'

// A decorative glyph: hidden from assistive technology, so the control around it carries the name.
withDefaults(defineProps<{ name: IconName; large?: boolean }>(), { large: false })
</script>

<template>
  <component
    :is="ICONS[name]"
    class="icon"
    :class="{ 'icon--lg': large }"
    aria-hidden="true"
    focusable="false"
  />
</template>

<style lang="scss" src="./base-icon.scss"></style>
