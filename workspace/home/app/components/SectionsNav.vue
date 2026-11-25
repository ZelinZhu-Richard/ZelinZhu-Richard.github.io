<script setup>
// The seven sections as a plain numbered index (the Contact page's footer).
import content from '#build/site-content.mjs';
import { stoneItems } from '~/utils/stones.js';

const { ui } = content;
const stones = stoneItems(content.stones);
</script>

<template>
  <nav class="sections" :aria-label="ui.sections">
    <ol>
      <li v-for="stone in stones" :key="stone.id">
        <a :href="stone.href" :data-stone="stone.id">
          <span class="sections-number">{{ stone.number }}</span>
          <span class="sections-title">{{ stone.title }}</span>
          <span class="sections-subtitle">{{ stone.subtitle }}</span>
        </a>
      </li>
    </ol>
  </nav>
</template>
