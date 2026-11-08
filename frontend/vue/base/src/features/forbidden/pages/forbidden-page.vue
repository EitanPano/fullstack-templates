<script setup lang="ts">
import AppButton from '@/shared/components/app-button.vue'
import PageHeader from '@/shared/components/page-header.vue'

// What roleGuard shows an account that holds the wrong role. The API enforces the role again on
// every call; this only explains why the screen is not there.
</script>

<template>
  <section class="forbidden">
    <PageHeader :heading="$t('forbidden.title')" :description="$t('forbidden.description')">
      <template #actions>
        <AppButton to="/">{{ $t('forbidden.home') }}</AppButton>
      </template>
    </PageHeader>
  </section>
</template>
