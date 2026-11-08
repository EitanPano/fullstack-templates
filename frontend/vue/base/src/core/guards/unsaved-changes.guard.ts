import { ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

// Asks before a page with unsaved edits is left. Call it in the page's setup with a function that
// answers whether there are changes, and bind the returned state to a `<ConfirmDialog>`:
// `v-model:open="guard.open.value"`, `@confirm="guard.confirm"`, `@cancel="guard.cancel"`. The
// navigation waits for the answer; with no changes it goes through untouched.
export function useUnsavedChangesGuard(hasChanges: () => boolean) {
  const open = ref(false)
  let decide: ((leave: boolean) => void) | null = null

  onBeforeRouteLeave(() => {
    if (!hasChanges()) return true
    open.value = true
    return new Promise<boolean>((resolve) => {
      decide = resolve
    })
  })

  function answer(leave: boolean): void {
    open.value = false
    decide?.(leave)
    decide = null
  }

  return {
    open,
    confirm: () => {
      answer(true)
    },
    cancel: () => {
      answer(false)
    },
  }
}
