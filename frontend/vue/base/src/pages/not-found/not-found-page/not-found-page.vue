<script setup lang="ts">
import BaseButton from '@/shared/components/base-button/base-button.vue'
import PageContainer from '@/shared/components/page-container/page-container.vue'
import PageHeader from '@/shared/components/page-header/page-header.vue'
</script>

<template>
  <PageContainer>
    <section class="not-found">
      <PageHeader :heading="$t('notFound.title')" :description="$t('notFound.description')" />
      <BaseButton to="/" variant="secondary">{{ $t('notFound.home') }}</BaseButton>
    </section>
  </PageContainer>
</template>

<style lang="scss" src="./not-found-page.scss"></style>
