<script setup lang="ts">
import BaseButton from '@/shared/components/base-button.vue'
import PageHeader from '@/shared/components/page-header.vue'
</script>

<template>
  <section class="not-found">
    <PageHeader :heading="$t('notFound.title')" :description="$t('notFound.description')" />
    <BaseButton to="/" variant="secondary">{{ $t('notFound.home') }}</BaseButton>
  </section>
</template>
