<script setup lang="ts">
import { computed } from 'vue'

import { DISPLAY_NAME } from '@/core/config/constants'
import type { ThemeChoice } from '@/core/providers/theme'
import BaseButton from '@/shared/components/base-button.vue'
import BaseIcon from '@/shared/components/base-icon.vue'
import type { IconName } from '@/shared/components/icons'
import { useNetworkStore } from '@/store/network.store'
import { useThemeStore } from '@/store/theme.store'

import { accountSlot, installButton, languageToggle } from './slots'

// The banner: the product name (home), the theme toggle, the offline badge and, below lg, the
// button that opens the side-nav drawer. The language toggle, the install button and the account
// menu come through slots.ts.
defineProps<{ navOpen?: boolean }>()
defineEmits<{ navToggle: [] }>()

const THEME_ICON: Record<ThemeChoice, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' }
const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' }

const theme = useThemeStore()
const network = useNetworkStore()

const themeIcon = computed(() => THEME_ICON[theme.choice])
const current = computed(() => `theme.${theme.choice}`)
const next = computed(() => `theme.${NEXT[theme.choice]}`)

const Account = accountSlot()
const Language = languageToggle()
const Install = installButton()
</script>

<template>
  <header class="header">
    <div class="header__inner container">
      <BaseButton
        class="header__nav-toggle"
        variant="ghost"
        size="icon"
        :aria-label="$t(navOpen ? 'nav.close' : 'nav.open')"
        :aria-expanded="navOpen ? 'true' : 'false'"
        :aria-controls="navOpen ? 'side-nav' : undefined"
        @click="$emit('navToggle')"
      >
        <BaseIcon :name="navOpen ? 'close' : 'menu'" />
      </BaseButton>
      <RouterLink class="header__brand" to="/">{{ DISPLAY_NAME }}</RouterLink>
      <div class="header__tools">
        <span class="header__status" aria-live="polite">
          <Transition name="status">
            <span v-if="!network.online" class="badge badge--warning">
              <BaseIcon name="wifi-off" />
              {{ $t('shell.offline') }}
            </span>
          </Transition>
        </span>
        <component :is="Language" v-if="Language" />
        <component :is="Install" v-if="Install" />
        <BaseButton
          class="header__theme"
          variant="ghost"
          size="icon"
          :aria-label="$t('theme.toggle', { current: $t(current), next: $t(next) })"
          @click="theme.cycle()"
        >
          <BaseIcon :name="themeIcon" />
        </BaseButton>
        <span class="visually-hidden" role="status">
          {{ $t('theme.current', { current: $t(current) }) }}
        </span>
        <component :is="Account" v-if="Account" />
      </div>
    </div>
  </header>
</template>

<style lang="scss" src="./app-header.scss"></style>
