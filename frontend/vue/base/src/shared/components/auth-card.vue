<script setup lang="ts">
// The card of every account screen: the page's one h1 and its description, the form in the
// default slot, and a footer link to the other screen in the `footer` slot. `heading` and
// `description` arrive already translated.
defineProps<{ heading: string; description?: string }>()
</script>

<template>
  <section class="auth-card">
    <div class="auth-card__header">
      <h1 class="auth-card__title">{{ heading }}</h1>
      <p v-if="description" class="auth-card__description">{{ description }}</p>
    </div>
    <div class="auth-card__content"><slot /></div>
    <div class="auth-card__footer"><slot name="footer" /></div>
  </section>
</template>
