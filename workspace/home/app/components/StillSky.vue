<script setup>
// The still background: night to indigo with a few stars, CSS only (home.css). It is in
// the prerendered page, so it is what readers see without JavaScript or WebGL, behind
// the stub engine, and while the scene loads. It fades once the scene has drawn a frame.
import { sceneState } from '~/composables/useScene.js';
</script>

<template>
  <div class="sky-still" :class="{ 'is-covered': sceneState.drawn }" aria-hidden="true" />
</template>
