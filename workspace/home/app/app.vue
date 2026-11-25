<script setup>
import content from '#build/site-content.mjs';

const { ui } = content;
</script>

<template>
  <a class="skip-link" href="#main">{{ ui.skip }}</a>
  <StillSky />
  <!-- Client-only and outside <NuxtPage>, so one canvas survives the move between / and /contacts/. -->
  <SceneCanvas />
  <ScenePreloader />
  <HomeHeader />
  <NuxtPage />
</template>
