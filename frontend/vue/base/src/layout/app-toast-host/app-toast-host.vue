<script setup lang="ts">
import { ToastProvider, ToastViewport } from 'reka-ui'

import BaseToast from '@/shared/components/base-toast/base-toast.vue'
import { useNotificationStore } from '@/store/notification.store'

// The notification store list, rendered through Reka Toast: the provider and viewport live here,
// each toast is a presentational BaseToast. Reka owns the timers (each toast has its `timeoutMs`; 0
// stays until answered) and pauses them while the list is hovered or focused.
const notifications = useNotificationStore()
</script>

<template>
  <ToastProvider :label="$t('toast.label')">
    <BaseToast
      v-for="toast in notifications.toasts"
      :key="toast.id"
      :kind="toast.kind"
      :message="$t(toast.messageKey, toast.params ?? {})"
      :action-label="toast.action ? $t(toast.action.labelKey) : undefined"
      :duration="toast.timeoutMs"
      @action="toast.action?.run()"
      @dismiss="notifications.dismiss(toast.id)"
    />
    <ToastViewport class="toast-viewport" :label="$t('toast.region')" />
  </ToastProvider>
</template>

<style lang="scss" src="./app-toast-host.scss"></style>
