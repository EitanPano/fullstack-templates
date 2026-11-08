import { useId } from 'vue'

// A DOM id that is unique within the page: `field-v-0`, `field-v-1`, ... Used for the ids that
// label and describe a control, so two fields never share one. Call it in setup.
export function useUniqueId(prefix: string): string {
  return `${prefix}-${useId()}`
}
