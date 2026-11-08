<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

import AppButton from '@/shared/components/app-button.vue'
import { useAuthStore } from '@/store/auth.store'

// The header's account slot (slots.ts): a visitor gets a sign-in link, an account an avatar button
// that opens a panel with the email, the profile link and sign-out. There is no theme control
// here; the header has its own. The avatar draws the initials from `data-initials` in CSS, so the
// button's accessible name is its label alone (visible text the name lacks fails WCAG 2.5.3).
const auth = useAuthStore()
const { user, isLoggedIn } = storeToRefs(auth)
const router = useRouter()

const menu = useTemplateRef<HTMLElement>('menu')
const open = ref(false)
const initials = computed(() => (user.value?.email ?? '').slice(0, 2).toUpperCase())

function close(): void {
  open.value = false
}

// Escape closes the menu and hands focus back to its trigger.
function escape(): void {
  if (!open.value) return
  close()
  menu.value?.querySelector('button')?.focus()
}

// Focus leaving the menu (a click elsewhere, Tab past the last item) closes it.
function leave(event: FocusEvent): void {
  const next = event.relatedTarget
  if (next instanceof Node && menu.value?.contains(next)) return
  close()
}

async function signOut(): Promise<void> {
  close()
  if (await auth.logout()) await router.push('/')
}
</script>

<template>
  <div
    v-if="isLoggedIn"
    ref="menu"
    class="account-menu"
    role="presentation"
    @keydown.esc="escape"
    @focusout="leave"
  >
    <AppButton
      class="account-menu__trigger"
      variant="ghost"
      size="icon"
      :aria-label="$t('auth.menu.label')"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="open ? 'account-menu' : undefined"
      @click="open = !open"
    >
      <span class="avatar" aria-hidden="true" :data-initials="initials"></span>
    </AppButton>
    <div
      v-if="open"
      id="account-menu"
      class="account-menu__panel"
      role="group"
      :aria-label="$t('auth.menu.label')"
    >
      <p class="account-menu__email">{{ user?.email }}</p>
      <AppButton to="/profile" variant="ghost" size="sm" @click="close">{{
        $t('auth.menu.profile')
      }}</AppButton>
      <AppButton variant="ghost" size="sm" @click="signOut">{{
        $t('auth.menu.signOut')
      }}</AppButton>
    </div>
  </div>
  <AppButton v-else class="account-menu__sign-in" to="/auth/login" variant="ghost" size="sm">{{
    $t('auth.menu.signIn')
  }}</AppButton>
</template>
