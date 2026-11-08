<script setup lang="ts">
import type { NavEntry } from '@/models/nav/interface'

// The Primary navigation landmark: one link per entry, the current page marked. The side nav
// renders it inline from lg and inside its drawer below.
defineProps<{ entries: readonly NavEntry[] }>()
</script>

<template>
  <nav :aria-label="$t('nav.primary')">
    <ul class="side-nav__list">
      <li v-for="entry in entries" :key="entry.path">
        <RouterLink
          class="side-nav__link"
          :to="entry.path"
          :active-class="entry.path === '/' ? '' : 'is-active'"
          exact-active-class="is-active"
          >{{ $t(entry.labelKey) }}</RouterLink
        >
      </li>
    </ul>
  </nav>
</template>
