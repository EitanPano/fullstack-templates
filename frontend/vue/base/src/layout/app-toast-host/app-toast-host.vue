<script setup lang="ts">
import BaseToast from '@/shared/components/base-toast/base-toast.vue'
import BaseToastHost from '@/shared/components/base-toast/base-toast-host.vue'
import { useNotificationStore } from '@/store/notification.store'

// The notification store list, rendered through BaseToastHost, each toast a presentational
// BaseToast. Each toast has its `timeoutMs`; 0 stays until answered.
const notifications = useNotificationStore()
</script>

<template>
  <BaseToastHost :label="$t('toast.label')" :viewport-label="$t('toast.region')" class="toast-viewport">
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
  </BaseToastHost>
</template>

<style lang="scss" src="./app-toast-host.scss"></style>
