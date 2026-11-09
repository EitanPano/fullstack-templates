<script setup lang="ts">
import AppButton from '@/shared/components/app-button.vue'
import { useInstallPromptStore } from '@/store/install-prompt.store'

// The header's install control: present only while the browser offers to install the app.
const install = useInstallPromptStore()

function onInstall(): void {
  void install.promptInstall()
}
</script>

<template>
  <AppButton v-if="install.canInstall" variant="ghost" size="sm" @click="onInstall">
    {{ $t('pwa.install') }}
  </AppButton>
</template>
