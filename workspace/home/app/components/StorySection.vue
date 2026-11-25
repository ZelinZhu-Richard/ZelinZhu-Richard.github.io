<script setup>
// One scroll section of the story and the frame that holds its text. On the plain page
// the frame is in the flow; staged (useStoryMotion), the section is a scroll spacer as
// tall as its schedule length (--len, in vh) and the frame is fixed over the viewport,
// shown while the section's window is open. utils/sections.js has the rule.
import { computed } from 'vue';

const props = defineProps({
  /** @type {import('vue').PropType<import('../utils/sections.js').StorySection>} */
  section: { type: Object, required: true },
});

const classes = computed(() => [
  `is-${props.section.kind}`,
  props.section.place ? `place-${props.section.place}` : '',
  props.section.align ? `align-${props.section.align}` : '',
  props.section.last ? 'is-last' : '',
]);
</script>

<template>
  <section
    :id="section.id"
    class="story-section"
    :class="classes"
    :style="{ '--len': section.len }"
    :data-index="section.index"
  >
    <div class="story-frame">
      <slot />
    </div>
  </section>
</template>
