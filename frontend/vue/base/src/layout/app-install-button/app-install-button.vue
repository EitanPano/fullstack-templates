<script setup lang="ts">
import BaseButton from '@/shared/components/base-button/base-button.vue'
import { useInstallPromptStore } from '@/store/install-prompt.store'

// The install control, which the product places: present only while the browser offers to
// install the app.
const install = useInstallPromptStore()

function onInstall(): void {
  void install.promptInstall()
}
</script>

<template>
  <BaseButton v-if="install.canInstall" variant="ghost" size="sm" @click="onInstall">
    {{ $t('pwa.install') }}
  </BaseButton>
</template>
