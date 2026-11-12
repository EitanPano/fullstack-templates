<script setup lang="ts">
import { computed, inject, useAttrs } from 'vue'

import { DEV_KEY } from '@/shared/composables/dev-mode'

import BaseSpinner from '../base-spinner/base-spinner.vue'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'icon'

// The one place for <button>. With `to` set it renders a router link that looks the same, so
// navigation and actions share one control. An `icon` button has no text and needs an `aria-label`
// (attributes fall through to the element, as do click handlers).
const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant
    size?: ButtonSize
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    to?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    loading: false,
    to: undefined,
  },
)

const attrs = useAttrs()

const classes = computed(() => [
  'button',
  `button--${props.variant}`,
  { [`button--${props.size}`]: props.size !== 'md', 'is-loading': props.loading },
])
const inactive = computed(() => props.disabled || props.loading)

const dev = inject(DEV_KEY, false)

// A developer mistake, so it is reported in development only.
if (dev && props.size === 'icon' && !attrs['aria-label'] && !attrs['aria-labelledby']) {
  console.error('BaseButton: size="icon" needs an aria-label.')
}
</script>

<template>
  <RouterLink v-if="to" :to="to" :class="classes" :aria-disabled="inactive ? 'true' : undefined">
    <BaseSpinner v-if="loading" decorative />
    <slot />
  </RouterLink>
  <button
    v-else
    :class="classes"
    :type="type"
    :disabled="inactive"
    :aria-busy="loading ? 'true' : undefined"
  >
    <BaseSpinner v-if="loading" decorative />
    <slot />
  </button>
</template>

<style lang="scss" src="./base-button.scss"></style>
