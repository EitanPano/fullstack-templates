<script setup lang="ts">
import { DISPLAY_NAME } from '@/core/config/constants'
import PageContainer from '@/shared/components/page-container.vue'
import PageHeader from '@/shared/components/page-header.vue'

// The index route: the product's name as the one `h1`, through the page pattern. Replace it.
</script>

<template>
  <PageContainer>
    <section class="home">
      <PageHeader :heading="DISPLAY_NAME" :description="$t('home.description')" />
    </section>
  </PageContainer>
</template>

<style lang="scss" src="./home-page.scss"></style>
