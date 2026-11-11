<script setup lang="ts">
import { computed } from 'vue'

import type { ThemeChoice } from '@/core/providers/theme'
import BaseButton from '@/shared/components/base-button/base-button.vue'
import BaseIcon from '@/shared/components/base-icon/base-icon.vue'
import type { IconName } from '@/shared/components/icons'
import { useThemeStore } from '@/store/theme.store'

// The theme switch: one button cycling light, dark and system, named by the current and the next
// choice, and a polite status line announcing the active one. A product places it where it
// wants; it has one root, so a `class` passed to it lands there without a warning.
const THEME_ICON: Record<ThemeChoice, IconName> = { light: 'sun', dark: 'moon', system: 'monitor' }
const NEXT: Record<ThemeChoice, ThemeChoice> = { light: 'dark', dark: 'system', system: 'light' }

const theme = useThemeStore()

const themeIcon = computed(() => THEME_ICON[theme.choice])
const current = computed(() => `theme.${theme.choice}`)
const next = computed(() => `theme.${NEXT[theme.choice]}`)
</script>

<template>
  <span class="theme-toggle">
    <BaseButton
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
  </span>
</template>
