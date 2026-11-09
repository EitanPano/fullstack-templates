<script setup lang="ts">
import { computed } from 'vue'

import { useFieldControl } from './form-field-context'

// A multi-line <textarea> bound with v-model. With `maxlength` set it also shows how many
// characters are left. Other attributes (name, placeholder, data-*) land on the textarea;
// `placeholder` arrives translated.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ rows?: number; maxlength?: number; disabled?: boolean; readonly?: boolean }>(),
  { rows: 4, maxlength: undefined, disabled: false, readonly: false },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ blur: [] }>()

const { controlId, invalid, describedBy } = useFieldControl()
const counterId = `${controlId}-counter`
const remaining = computed(() =>
  props.maxlength === undefined ? null : Math.max(0, props.maxlength - model.value.length),
)
const describedByAll = computed(() => {
  const ids = [describedBy.value, props.maxlength === undefined ? undefined : counterId]
  const joined = ids.filter(Boolean).join(' ')
  return joined === '' ? undefined : joined
})
</script>

<template>
  <div class="control control--textarea">
    <textarea
      v-bind="$attrs"
      :id="controlId"
      v-model="model"
      class="control__field"
      :rows="rows"
      :maxlength="maxlength"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="describedByAll"
      @blur="emit('blur')"
    />
    <p v-if="remaining !== null" :id="counterId" class="control__counter">
      {{ $t('form.charactersLeft', { count: remaining }) }}
    </p>
  </div>
</template>

<style lang="scss" src="./controls.scss"></style>
