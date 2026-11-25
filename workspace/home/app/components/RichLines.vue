<script setup>
// Renders lines from app/utils/text.js: a <br> between lines, <em> for *italics*.
defineProps({
  /** @type {import('vue').PropType<import('../utils/text.js').Line[]>} */
  lines: { type: Array, required: true },
});
</script>

<template>
  <template v-for="(line, i) in lines" :key="i">
    <br v-if="i">
    <template v-for="(segment, j) in line" :key="j">
      <em v-if="segment.em">{{ segment.text }}</em>
      <template v-else>{{ segment.text }}</template>
    </template>
  </template>
</template>
