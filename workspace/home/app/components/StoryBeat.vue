<script setup>
// One of the 17 text beats. Plain text beats are display lines on the quiet side of the
// frame; a beat with a heading and a body is a small card on the side STORYBOARD.md gives
// it; a single word is large and centred. `.js-split` marks what SplitText animates.
defineProps({
  /** @type {import('vue').PropType<import('../utils/sections.js').StorySection>} */
  section: { type: Object, required: true },
});
</script>

<template>
  <StorySection :section="section">
    <div v-if="section.kind === 'card'" class="beat-block beat-card">
      <h2 class="beat-heading js-split"><RichLines :lines="section.blocks.heading" /></h2>
      <p v-for="(paragraph, i) in section.blocks.paragraphs" :key="i" class="beat-body js-split"><RichLines :lines="paragraph" /></p>
    </div>
    <div v-else-if="section.kind === 'word'" class="beat-block beat-word">
      <p v-for="(paragraph, i) in section.blocks.paragraphs" :key="i" class="beat-word-text js-split"><RichLines :lines="paragraph" /></p>
    </div>
    <div v-else-if="section.kind === 'text'" class="beat-block beat-text">
      <p v-for="(paragraph, i) in section.blocks.paragraphs" :key="i" class="beat-lines js-split"><RichLines :lines="paragraph" /></p>
    </div>
  </StorySection>
</template>
