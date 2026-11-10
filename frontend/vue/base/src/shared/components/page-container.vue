<script setup lang="ts">
// The page pattern's frame: owns the container width, centring and gutters that `main` no longer
// has, so a full-bleed screen (a board, an editor) simply leaves it out. Every routed page under
// the main layout wraps its content in it.
</script>

<template>
  <div class="page-container"><slot /></div>
</template>

<style lang="scss" src="./page-container.scss"></style>
