<script setup>
// The story: one <section> per schedule section (utils/schedule.js), in scroll order:
// the hero, the 17 text beats, the seven stones, the coda. useStoryMotion turns scroll
// into scene progress and, with the scene, stages the text over it (.is-staged); without
// JavaScript or WebGL it is a plain, readable page.
import { ref } from 'vue';
import { definePageMeta } from '#imports';
import content from '#build/site-content.mjs';
import { useHomeHead } from '~/composables/useHomeHead.js';
import { storyState, useStoryMotion } from '~/composables/useStoryMotion.js';
import { schedule } from '~/utils/schedule.js';
import { storySections } from '~/utils/sections.js';

// GitHub Pages serves this file at /index.html too; without the alias the router finds no
// page there and replaces the homepage with the "Not found" error after it loads.
definePageMeta({ alias: ['/index.html'] });
useHomeHead('story');

const sections = storySections(content, schedule);
const story = ref(/** @type {HTMLElement | null} */ (null));
useStoryMotion(story);
</script>

<template>
  <main id="main" class="page page-story">
    <div ref="story" class="story" :class="{ 'is-staged': storyState.staged }">
      <template v-for="section in sections" :key="section.id">
        <StoryHero v-if="section.kind === 'hero'" :section="section" />
        <StoryStones v-else-if="section.kind === 'stones'" :section="section" />
        <StoryCoda v-else-if="section.kind === 'coda'" :section="section" />
        <StoryBeat v-else :section="section" />
      </template>
    </div>
  </main>
</template>
