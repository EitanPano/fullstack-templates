<script setup lang="ts">
import { ToastAction, ToastClose, ToastDescription, ToastRoot } from 'reka-ui'

import type { ToastKind } from '@/models/notification/interface'

import BaseButton from './base-button.vue'
import BaseIcon from './base-icon.vue'
import type { IconName } from './icons'

// One toast on the Reka Toast, presentational: it knows no store. It must sit inside a Reka
// ToastProvider and ToastViewport (components/app-toast-host.vue). Reka owns the timer (a
// `duration` of 0 stays until answered) and pauses it while the list is hovered or focused; an
// error is announced assertively, the rest politely. `message` and `actionLabel` arrive already
// translated; `dismiss` fires when the toast closes for any reason, `action` before it when the
// action button is pressed. data-state is open or closed.
const ICON: Record<ToastKind, IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  warning: 'alert-triangle',
  info: 'info',
}

withDefaults(
  defineProps<{ kind: ToastKind; message: string; actionLabel?: string; duration?: number }>(),
  { actionLabel: undefined, duration: 5000 },
)
const emit = defineEmits<{ action: []; dismiss: [] }>()
</script>

<template>
  <ToastRoot
    :class="['toast', `toast--${kind}`]"
    :type="kind === 'error' ? 'foreground' : 'background'"
    :duration="duration"
    :open="true"
    @update:open="(open: boolean) => !open && emit('dismiss')"
  >
    <BaseIcon :name="ICON[kind]" />
    <ToastDescription class="toast__message">{{ message }}</ToastDescription>
    <ToastAction v-if="actionLabel" as-child :alt-text="actionLabel">
      <BaseButton variant="ghost" size="sm" @click="emit('action')">{{ actionLabel }}</BaseButton>
    </ToastAction>
    <ToastClose as-child>
      <BaseButton variant="ghost" size="icon" :aria-label="$t('actions.dismiss')">
        <BaseIcon name="close" />
      </BaseButton>
    </ToastClose>
  </ToastRoot>
</template>

<style lang="scss" src="./base-toast.scss"></style>
