<script setup lang="ts">
import AppButton from './app-button.vue'

// The submit row of a form: a primary submit button (spinner and inert while `pending`) and an
// optional secondary cancel. The submit is a real type=submit, so the form submit event fires.
// Stacked on phones, inline from md. Labels are keys of the copy table.
withDefaults(
  defineProps<{
    submitKey?: string
    cancelKey?: string
    pending?: boolean
    disabled?: boolean
    cancellable?: boolean
  }>(),
  {
    submitKey: 'form.submit',
    cancelKey: 'form.cancel',
    pending: false,
    disabled: false,
    cancellable: false,
  },
)
defineEmits<{ cancelled: [] }>()
</script>

<template>
  <div class="form-actions">
    <AppButton type="submit" :loading="pending" :disabled="disabled">{{ $t(submitKey) }}</AppButton>
    <AppButton
      v-if="cancellable"
      variant="secondary"
      :disabled="pending"
      @click="$emit('cancelled')"
      >{{ $t(cancelKey) }}</AppButton
    >
  </div>
</template>
