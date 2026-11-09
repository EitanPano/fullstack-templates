<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { errorMessageKey } from '@/models/api/error-copy'
import BaseButton from '@/shared/components/base-button.vue'
import BaseSkeleton from '@/shared/components/base-skeleton.vue'
import ErrorState from '@/shared/components/error-state.vue'
import PageHeader from '@/shared/components/page-header.vue'
import { relativeTime } from '@/shared/utils/relative-time'
import { useHealthStore } from '@/store/health.store'

import HealthBadge from './components/health-badge.vue'

// The home screen: whether the server answers, its version and how long it has been up. The page
// reads the store and never a service; the store toasts the failure, the page shows the retry.
const store = useHealthStore()
const { health, checkedAt, loading, failed, error } = storeToRefs(store)
const { locale } = useI18n()

const errorKey = computed(() => errorMessageKey(error.value?.code ?? 'unknown'))

void store.load()
</script>

<template>
  <section class="health-status">
    <PageHeader :heading="$t('health.title')" :description="$t('health.description')">
      <template #actions>
        <BaseButton variant="secondary" :loading="loading" @click="store.load()">{{
          $t('health.refresh')
        }}</BaseButton>
      </template>
    </PageHeader>

    <ErrorState v-if="failed" :description="$t(errorKey)" @retry="store.load()" />
    <dl v-else-if="health" class="health-status__facts" :aria-busy="loading">
      <div class="health-status__fact">
        <dt>{{ $t('health.status.label') }}</dt>
        <dd><HealthBadge :status="health.status" /></dd>
      </div>
      <div class="health-status__fact">
        <dt>{{ $t('health.version') }}</dt>
        <dd>{{ health.version }}</dd>
      </div>
      <div class="health-status__fact">
        <dt>{{ $t('health.uptime') }}</dt>
        <dd>{{ $t('health.uptimeValue', { seconds: health.uptimeSeconds }) }}</dd>
      </div>
      <div class="health-status__fact">
        <dt>{{ $t('health.checked') }}</dt>
        <dd>{{ relativeTime(checkedAt, locale) }}</dd>
      </div>
    </dl>
    <div v-else class="health-status__loading" role="status" aria-busy="true">
      <span class="visually-hidden">{{ $t('app.loading') }}</span>
      <BaseSkeleton variant="block" size="md" />
      <BaseSkeleton :lines="3" />
    </div>
  </section>
</template>

<style lang="scss" src="./health-status-page.scss"></style>
