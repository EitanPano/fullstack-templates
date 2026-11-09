<script setup lang="ts">
import { computed } from 'vue'

export type SkeletonVariant = 'block' | 'text'
export type SkeletonSize = 'sm' | 'md' | 'lg'

// A placeholder shaped like the content it stands for: a block (sized sm, md or lg) or `lines`
// lines of text. It is hidden from assistive technology; the region that loads says it is busy.
const props = withDefaults(
  defineProps<{ variant?: SkeletonVariant; size?: SkeletonSize; lines?: number }>(),
  { variant: 'text', size: 'md', lines: 3 },
)

const count = computed(() => (props.variant === 'text' ? Math.max(1, props.lines) : 1))
const itemClass = computed(() =>
  props.variant === 'block' ? `skeleton__item skeleton__item--${props.size}` : 'skeleton__item',
)
</script>

<template>
  <div class="skeleton" :class="{ 'skeleton--text': variant === 'text' }" aria-hidden="true">
    <div v-for="index in count" :key="index" :class="itemClass" />
  </div>
</template>

<style lang="scss" src="./base-skeleton.scss"></style>
