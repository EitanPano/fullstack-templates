<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'

import BaseButton from './base-button.vue'
import BaseIcon from './base-icon.vue'

export type ModalSize = 'sm' | 'md' | 'lg'

// The frame every modal shares, on the Reka Dialog: role=dialog named by its title, a focus trap,
// Escape and a click on the backdrop to close, and focus handed back to the element that opened
// it. `v-model:open` shows it; `title` arrives already translated; the default slot is the body.
// data-state is open or closed.
withDefaults(defineProps<{ title: string; size?: ModalSize }>(), { size: 'md' })
const open = defineModel<boolean>('open', { default: false })
</script>

<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="modal__backdrop" />
      <DialogContent :class="['modal', `modal--${size}`]" :aria-describedby="undefined">
        <header class="modal__header">
          <DialogTitle class="modal__title">{{ title }}</DialogTitle>
          <DialogClose as-child>
            <BaseButton variant="ghost" size="icon" :aria-label="$t('modal.close')">
              <BaseIcon name="close" />
            </BaseButton>
          </DialogClose>
        </header>
        <div class="modal__body"><slot /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style lang="scss" src="./base-modal.scss"></style>
