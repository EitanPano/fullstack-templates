<script setup lang="ts">
import AppButton from '@/shared/components/app-button.vue'
import PageHeader from '@/shared/components/page-header.vue'
</script>

<template>
  <section class="not-found">
    <PageHeader :heading="$t('notFound.title')" :description="$t('notFound.description')" />
    <AppButton to="/" variant="secondary">{{ $t('notFound.home') }}</AppButton>
  </section>
</template>
