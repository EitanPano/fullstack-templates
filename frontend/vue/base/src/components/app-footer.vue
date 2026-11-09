<script setup lang="ts">
import { DISPLAY_NAME } from '@/core/config/constants'

const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="container">{{ $t('shell.footer', { year, name: DISPLAY_NAME }) }}</div>
  </footer>
</template>
