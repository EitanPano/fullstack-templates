<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from './base-button.vue'
import BaseIcon from './base-icon.vue'
import { useFieldControl } from './form-field-context'

export type InputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search'

// A text-like <input> bound with v-model. A `number` input holds a number (null when empty);
// every other type holds a string. A `password` input has a show/hide toggle. Inside a form-field
// it takes the field id and aria wiring. Other attributes (name, autocomplete, inputmode,
// placeholder, data-*) land on the input; `placeholder` arrives translated.
defineOptions({ inheritAttrs: false })

const props = withDefaults(
  defineProps<{ type?: InputType; disabled?: boolean; readonly?: boolean }>(),
  { type: 'text', disabled: false, readonly: false },
)
const model = defineModel<string | number | null>({ default: '' })
const emit = defineEmits<{ blur: [] }>()

const { controlId, invalid, describedBy } = useFieldControl()
const revealed = ref(false)
const nativeType = computed(() =>
  props.type === 'password' && revealed.value ? 'text' : props.type,
)

function onInput(event: Event): void {
  const text = (event.target as HTMLInputElement).value
  if (props.type !== 'number') {
    model.value = text
    return
  }
  model.value = text === '' || Number.isNaN(Number(text)) ? null : Number(text)
}
</script>

<template>
  <div class="control control--input">
    <input
      v-bind="$attrs"
      :id="controlId"
      class="control__field"
      :type="nativeType"
      :value="model ?? ''"
      :disabled="disabled"
      :readonly="readonly"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      @input="onInput"
      @blur="emit('blur')"
    />
    <span v-if="type === 'password'" class="control__toggle">
      <BaseButton
        variant="ghost"
        size="icon"
        :disabled="disabled"
        :aria-label="$t(revealed ? 'form.hidePassword' : 'form.showPassword')"
        @click="revealed = !revealed"
      >
        <BaseIcon :name="revealed ? 'eye-off' : 'eye'" />
      </BaseButton>
    </span>
  </div>
</template>

<style lang="scss" src="./controls.scss"></style>
