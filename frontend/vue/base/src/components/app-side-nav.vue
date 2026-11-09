<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, inject, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import type { NavEntry } from '@/models/nav/interface'
import BaseButton from '@/shared/components/base-button.vue'
import BaseIcon from '@/shared/components/base-icon.vue'
import { useMediaQuery } from '@/shared/composables/use-media-query'
import { ROLES_KEY } from '@/shared/directives/roles'

import AppNavLinks from './app-nav-links.vue'

// The primary navigation, from the nav table the layout passes in. From lg it is an inline column;
// below lg it is a drawer on the Reka Dialog (focus trap, Escape, focus return) that `open` shows.
// It closes on navigation and when the viewport grows to the inline layout. An entry with `roles`
// shows only to an account that holds one of them.
const props = withDefaults(defineProps<{ entries: readonly NavEntry[]; open?: boolean }>(), {
  open: false,
})
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const roles = inject(ROLES_KEY, ref<readonly string[]>([]))
const visible = computed(() =>
  props.entries.filter(
    (entry) => !entry.roles || entry.roles.some((role) => roles.value.includes(role)),
  ),
)

const isDesktop = useMediaQuery('(min-width: 1024px)')
const route = useRoute()

function close(): void {
  if (props.open) emit('update:open', false)
}

watch(() => route.fullPath, close)
watch(isDesktop, (desktop) => {
  if (desktop) close()
})
</script>

<template>
  <div>
    <div v-if="isDesktop" class="side-nav">
      <AppNavLinks :entries="visible" />
    </div>
    <DialogRoot v-else :open="open" @update:open="emit('update:open', $event)">
      <DialogPortal>
        <DialogOverlay class="side-nav-backdrop" />
        <DialogContent
          id="side-nav"
          class="side-nav side-nav--drawer"
          :aria-describedby="undefined"
        >
          <DialogTitle class="visually-hidden">{{ $t('nav.menu') }}</DialogTitle>
          <DialogClose as-child>
            <BaseButton
              class="side-nav__close"
              variant="ghost"
              size="icon"
              :aria-label="$t('nav.close')"
            >
              <BaseIcon name="close" />
            </BaseButton>
          </DialogClose>
          <AppNavLinks :entries="visible" />
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </div>
</template>
