<script setup lang="ts">
import BaseButton from '@/shared/components/base-button.vue'
import PageContainer from '@/shared/components/page-container.vue'
import PageHeader from '@/shared/components/page-header.vue'

// What roleGuard shows an account that holds the wrong role. The API enforces the role again on
// every call; this only explains why the screen is not there.
</script>

<template>
  <PageContainer>
    <section class="forbidden">
      <PageHeader :heading="$t('forbidden.title')" :description="$t('forbidden.description')">
        <template #actions>
          <BaseButton to="/">{{ $t('forbidden.home') }}</BaseButton>
        </template>
      </PageHeader>
    </section>
  </PageContainer>
</template>

<style lang="scss" src="./forbidden-page.scss"></style>
