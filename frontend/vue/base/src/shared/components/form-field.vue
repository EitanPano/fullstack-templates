<script setup lang="ts">
import { computed, provide } from 'vue'

import { useUniqueId } from '@/shared/composables/use-unique-id'

import { FORM_FIELD_KEY } from './form-field-context'

// Label, hint, the control and its error. The control is the default slot; it finds the field's id
// and aria wiring through FORM_FIELD_KEY. `label`, `hint` and `error` arrive already translated;
// the form decides when an error is shown (after blur or submit), the field only renders it.
const props = withDefaults(defineProps<{ label?: string; hint?: string; error?: string }>(), {
  label: undefined,
  hint: undefined,
  error: undefined,
})

const id = useUniqueId('field')
const invalid = computed(() => Boolean(props.error))
const describedBy = computed(() => {
  const ids = []
  if (props.hint) ids.push(`${id}-hint`)
  if (invalid.value) ids.push(`${id}-error`)
  return ids.length > 0 ? ids.join(' ') : undefined
})

provide(FORM_FIELD_KEY, { id, invalid, describedBy })
</script>

<template>
  <div class="form-field" :class="{ 'form-field--invalid': invalid }">
    <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- the control sits in the slot, tied by for -->
    <label v-if="label" class="form-field__label" :for="id">{{ label }}</label>
    <p v-if="hint" :id="`${id}-hint`" class="form-field__hint">{{ hint }}</p>
    <slot />
    <div :id="`${id}-error`" class="form-field__error" aria-live="polite">{{ error }}</div>
  </div>
</template>
