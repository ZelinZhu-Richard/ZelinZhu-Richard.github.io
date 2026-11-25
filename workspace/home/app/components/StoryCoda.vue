<script setup>
// The last section: the rings close, and the contact lines point to /contacts/.
import content from '#build/site-content.mjs';
import { lines } from '~/utils/text.js';

defineProps({
  /** @type {import('vue').PropType<import('../utils/sections.js').StorySection>} */
  section: { type: Object, required: true },
});

const { ui } = content;
const contactLines = content.contact.lines.map(lines);
</script>

<template>
  <StorySection :section="section">
    <div class="beat-block coda-block">
      <p v-for="(line, i) in contactLines" :key="i" class="coda-line js-split"><RichLines :lines="line" /></p>
      <p class="coda-cue js-rise">
        <NuxtLink to="/contacts/" class="cue-link">{{ ui.contact }}<span class="cue-rule" aria-hidden="true" /></NuxtLink>
      </p>
    </div>
  </StorySection>
</template>
