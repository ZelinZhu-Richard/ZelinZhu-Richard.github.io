<script setup>
// The fixed header on both pages: the name (home), the sound toggle and the menu.
// Navigation between / and /contacts/ stays inside the app; every other link is an
// ordinary link, so those pages load fresh.
import content from '#build/site-content.mjs';
import { navigateTo, useRoute } from '#imports';
import { sceneState } from '~/composables/useScene.js';

const { hero } = content;
const route = useRoute();

/** @param {MouseEvent} event */
function onHome(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (route.path !== '/') {
    navigateTo('/');
    return;
  }
  // Already home: back to the top. A long way back jumps rather than racing the story.
  const near = window.scrollY < window.innerHeight * 3;
  window.scrollTo({ top: 0, behavior: near && !sceneState.reducedMotion ? 'smooth' : 'auto' });
}
</script>

<template>
  <header class="masthead">
    <a class="masthead-name" href="/" :aria-current="route.path === '/' ? 'page' : undefined" @click="onHome">{{ hero.name }}</a>
    <div class="masthead-tools">
      <SoundToggle />
      <SiteMenu />
    </div>
  </header>
</template>
