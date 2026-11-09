<script setup lang="ts">
import { computed } from 'vue'

import { HEALTH_STATUS } from '@/models/health/constants'
import type { HealthStatus } from '@/models/health/interface'

// A status as a coloured pill: the tone and the text come from the status table in models/health,
// so the colour is never the only signal.
const props = defineProps<{ status: HealthStatus }>()
const view = computed(() => HEALTH_STATUS[props.status])
</script>

<template>
  <span class="health-badge" :class="`health-badge--${view.tone}`">{{ $t(view.labelKey) }}</span>
</template>

<style lang="scss" src="./health-badge.scss"></style>
