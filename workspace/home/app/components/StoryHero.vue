<script setup>
// Section 0: the name, the line under it and the scroll cue. Never animated in, so the
// page's largest text is there on first paint.
import content from '#build/site-content.mjs';
import { sceneState } from '~/composables/useScene.js';

defineProps({
  /** @type {import('vue').PropType<import('../utils/sections.js').StorySection>} */
  section: { type: Object, required: true },
});

const { hero, ui } = content;
</script>

<template>
  <StorySection :section="section">
    <div class="beat-block hero-block">
      <h1 class="hero-name">{{ hero.name }}</h1>
      <p class="hero-line">{{ hero.line }}</p>
    </div>
    <p class="hero-cue" :class="{ 'is-still': sceneState.reducedMotion }" aria-hidden="true">
      <span class="cue-rule" />{{ ui.scroll }}
    </p>
  </StorySection>
</template>
