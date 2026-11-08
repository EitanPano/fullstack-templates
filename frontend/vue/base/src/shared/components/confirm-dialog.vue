<script setup lang="ts">
import AppButton from './app-button.vue'
import AppModal from './app-modal.vue'

// Asks before a destructive or irreversible action: a message and a Cancel / Confirm pair in a
// small modal. Confirm emits `confirm`; Cancel, Escape, the backdrop and the X emit `cancel`; each
// then asks to close through `v-model:open`. `title`, `message` and `confirmLabel` arrive already
// translated.
const props = withDefaults(
  defineProps<{ title: string; message: string; confirmLabel?: string; danger?: boolean }>(),
  { confirmLabel: undefined, danger: false },
)
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ confirm: []; cancel: [] }>()

function answer(confirmed: boolean): void {
  if (confirmed) emit('confirm')
  else emit('cancel')
  open.value = false
}

// The modal closed itself (Escape, backdrop, X): nobody confirmed.
function dismissed(next: boolean): void {
  if (!next) answer(false)
}
</script>

<template>
  <AppModal :open="open" :title="props.title" size="sm" @update:open="dismissed">
    <p class="modal__message">{{ message }}</p>
    <div class="modal__actions">
      <AppButton variant="secondary" @click="answer(false)">{{ $t('modal.cancel') }}</AppButton>
      <AppButton :variant="danger ? 'danger' : 'primary'" @click="answer(true)">{{
        confirmLabel ?? $t('modal.confirm')
      }}</AppButton>
    </div>
  </AppModal>
</template>
