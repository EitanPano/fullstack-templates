<script setup lang="ts">
import {
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectPortal,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectViewport,
} from 'reka-ui'
import { computed } from 'vue'

import AppIcon from './app-icon.vue'
import { useFieldControl } from './form-field-context'

export type SelectOption = { readonly value: string; readonly labelKey: string }

// Reka refuses an empty string as an item value, so the empty choice travels under this stand-in.
const EMPTY = '__empty__'

// A select on the Reka Select, bound with v-model to the chosen option `value` string. With
// `emptyKey` set, a first choice with the value '' (and that label) lets the user choose nothing.
const props = withDefaults(
  defineProps<{
    options: readonly SelectOption[]
    emptyKey?: string
    disabled?: boolean
  }>(),
  { emptyKey: undefined, disabled: false },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ blur: [] }>()

const { controlId, invalid, describedBy } = useFieldControl()

const shown = computed(() => (model.value === '' ? (props.emptyKey ? EMPTY : '') : model.value))

function choose(value: string | undefined): void {
  model.value = value === undefined || value === EMPTY ? '' : value
}
</script>

<template>
  <div class="control control--select">
    <SelectRoot :model-value="shown" :disabled="disabled" @update:model-value="choose">
      <SelectTrigger
        :id="controlId"
        class="control__field select__trigger"
        :aria-invalid="invalid ? 'true' : undefined"
        :aria-describedby="describedBy"
        @blur="emit('blur')"
      >
        <SelectValue />
        <AppIcon name="chevron-down" />
      </SelectTrigger>
      <SelectPortal>
        <SelectContent class="select__content" position="popper" :side-offset="4">
          <SelectViewport class="select__viewport">
            <SelectItem v-if="emptyKey" class="select__item" :value="EMPTY">
              <SelectItemText>{{ $t(emptyKey) }}</SelectItemText>
            </SelectItem>
            <SelectItem
              v-for="option in options"
              :key="option.value"
              class="select__item"
              :value="option.value"
            >
              <SelectItemText>{{ $t(option.labelKey) }}</SelectItemText>
              <SelectItemIndicator><AppIcon name="check" /></SelectItemIndicator>
            </SelectItem>
          </SelectViewport>
        </SelectContent>
      </SelectPortal>
    </SelectRoot>
  </div>
</template>
