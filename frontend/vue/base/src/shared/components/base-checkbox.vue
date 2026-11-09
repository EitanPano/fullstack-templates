<script setup lang="ts">
import { CheckboxIndicator, CheckboxRoot } from 'reka-ui'

import BaseIcon from './base-icon.vue'
import { useFieldControl } from './form-field-context'

// A checkbox on the Reka Checkbox (a button with role=checkbox; data-state is checked or
// unchecked), bound with v-model to a boolean. The label is the default slot, so inside a
// form-field leave the field own `label` out: this control already has one.
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })
const model = defineModel<boolean>({ default: false })
const emit = defineEmits<{ blur: [] }>()

const { controlId, invalid, describedBy } = useFieldControl()
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/label-has-for -- the rule cannot see a bound for -->
  <label class="checkbox" :for="controlId">
    <CheckboxRoot
      :id="controlId"
      v-model="model"
      class="checkbox__box"
      :disabled="disabled"
      :aria-invalid="invalid ? 'true' : undefined"
      :aria-describedby="describedBy"
      @blur="emit('blur')"
    >
      <CheckboxIndicator><BaseIcon name="check" /></CheckboxIndicator>
    </CheckboxRoot>
    <span class="checkbox__label"><slot /></span>
  </label>
</template>

<style lang="scss" src="./controls.scss"></style>
